import type { DbClient } from "@/db/client";
import { recordAuditEvent } from "@/domains/admin/audit-repository";
import { getLevelByLanguageAndNumber } from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import { getEligibleLessonItems } from "@/domains/curriculum/lesson-curriculum-repository";
import {
  getAvailableThemes,
  selectLessonBatch,
} from "@/domains/lessons/lesson-batch";
import { CURRICULUM_MODES, DEFAULT_LESSON_BATCH_SIZE } from "@/domains/users";
import type { CurriculumMode } from "@/domains/users";
import {
  findLanguageSettings,
  saveCurriculumPreference,
} from "@/domains/users/user-repository";
import {
  getSandboxTimeOffset,
  setSandboxTimeOffset,
} from "@/domains/users/user-clock";
import type { SrsStage } from "@/domains/srs";
import { AdminError } from "@/lib/errors/admin-errors";

import {
  createSandboxForOwner,
  findSandboxByOwner,
  getSandboxSnapshot,
  makeAllReviewsDue,
  resetSandbox,
  setItemSrsStage,
  simulateLevel,
} from "./sandbox-repository";
import type {
  SandboxAccount,
  SandboxCurriculumPreview,
  SandboxSnapshot,
} from "./sandbox-types";

/**
 * Sandbox orchestration (spec 11 rewrite) — the `domains/admin`-adjacent
 * half of the Sandbox feature: composes `sandbox-repository.ts` with
 * idempotency and audit recording, exactly like `domains/admin`'s
 * `publication-service.ts` does for curriculum mutations. Lives in
 * `domains/sandbox` rather than `domains/admin` itself since the sandbox
 * concept (an isolated learner persona) isn't curriculum-management —
 * `domains/admin`'s own audit log is reused as the shared destination
 * (spec's own action list already expects `SANDBOX_*` actions there).
 */

async function findLevel1Id(db: DbClient, languageId: string): Promise<string> {
  // The sandbox persona is anchored to Level 1 as a *structure*, not as
  // learner-visible content, so it must resolve even while Level 1 is still
  // unpublished — an admin needs the sandbox precisely to test curriculum
  // before releasing it.
  const level1 = await getLevelByLanguageAndNumber(db, languageId, 1, {
    includeUnpublished: true,
  });
  if (!level1)
    throw new AdminError(
      "SANDBOX_OPERATION_FORBIDDEN",
      "Level 1 is not configured for this language yet.",
    );
  return level1.id;
}

export async function getOrCreateSandbox(
  db: DbClient,
  ownerUserId: string,
  languageId: string,
): Promise<SandboxAccount> {
  const existing = await findSandboxByOwner(db, ownerUserId);
  if (existing) return existing;

  const level1Id = await findLevel1Id(db, languageId);
  return createSandboxForOwner(db, { ownerUserId, languageId, level1Id });
}

export async function getSandboxSnapshotForOwner(
  db: DbClient,
  ownerUserId: string,
  languageId: string,
): Promise<SandboxSnapshot> {
  const account = await getOrCreateSandbox(db, ownerUserId, languageId);
  return getSandboxSnapshot(db, account);
}

export type SimulateLevelServiceInput = {
  ownerUserId: string;
  languageId: string;
  levelId: string;
  actorUserId: string;
  idempotencyKey: string;
};

export async function simulateLevelForSandbox(
  db: DbClient,
  input: SimulateLevelServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.simulate-level",
      key: input.idempotencyKey,
      payload: { levelId: input.levelId },
    },
    async (tx) => {
      const account = await getOrCreateSandbox(
        tx,
        input.ownerUserId,
        input.languageId,
      );
      await simulateLevel(tx, {
        sandboxUserId: account.sandboxUserId,
        levelId: input.levelId,
      });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_LEVEL_SIMULATED",
        resourceType: "sandbox",
        resourceId: account.sandboxUserId,
        afterData: { levelId: input.levelId },
      });
    },
  );
}

export type SetSandboxItemStageServiceInput = {
  ownerUserId: string;
  languageId: string;
  learningItemId: string;
  srsStage: SrsStage;
  actorUserId: string;
  idempotencyKey: string;
};

export async function setSandboxItemStage(
  db: DbClient,
  input: SetSandboxItemStageServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.set-item-stage",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        srsStage: input.srsStage,
      },
    },
    async (tx) => {
      const account = await getOrCreateSandbox(
        tx,
        input.ownerUserId,
        input.languageId,
      );
      await setItemSrsStage(tx, {
        sandboxUserId: account.sandboxUserId,
        learningItemId: input.learningItemId,
        languageId: input.languageId,
        srsStage: input.srsStage,
      });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_STAGE_CHANGED",
        resourceType: "sandbox_item",
        resourceId: input.learningItemId,
        afterData: { srsStage: input.srsStage },
      });
    },
  );
}

export type MakeSandboxReviewsDueServiceInput = {
  ownerUserId: string;
  languageId: string;
  actorUserId: string;
  idempotencyKey: string;
};

export async function makeSandboxReviewsDue(
  db: DbClient,
  input: MakeSandboxReviewsDueServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.make-reviews-due",
      key: input.idempotencyKey,
      payload: {},
    },
    async (tx) => {
      const account = await getOrCreateSandbox(
        tx,
        input.ownerUserId,
        input.languageId,
      );
      await makeAllReviewsDue(tx, account.sandboxUserId);
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_REVIEWS_FORCED_DUE",
        resourceType: "sandbox",
        resourceId: account.sandboxUserId,
      });
    },
  );
}

export type SetSandboxTimeOffsetServiceInput = {
  ownerUserId: string;
  languageId: string;
  actorUserId: string;
  /** Absolute offset from real server time, in seconds. `0` returns the persona to the present. */
  offsetSeconds: number;
  idempotencyKey: string;
};

/**
 * Spec 11's "Time simulation" control. Sets the sandbox persona's perceived
 * clock offset — real server time is never touched, and the database's own
 * check constraint makes it impossible to set an offset on a non-sandbox
 * user even if this function were called wrongly.
 *
 * An *absolute* offset rather than a relative nudge: "+7 days" from the UI
 * resolves to a concrete target here, so a retried request cannot compound
 * into +14 days. That matters because this is an idempotent mutation whose
 * payload must fully determine its effect.
 */
export async function setSandboxTimeOffsetForOwner(
  db: DbClient,
  input: SetSandboxTimeOffsetServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.set-time-offset",
      key: input.idempotencyKey,
      payload: { offsetSeconds: input.offsetSeconds },
    },
    async (tx) => {
      const account = await getOrCreateSandbox(
        tx,
        input.ownerUserId,
        input.languageId,
      );
      const previous = await getSandboxTimeOffset(tx, account.sandboxUserId);
      await setSandboxTimeOffset(
        tx,
        account.sandboxUserId,
        input.offsetSeconds,
      );
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_TIME_CHANGED",
        resourceType: "sandbox",
        resourceId: account.sandboxUserId,
        beforeData: { offsetSeconds: previous },
        afterData: { offsetSeconds: input.offsetSeconds },
      });
    },
  );
}

export type ResetSandboxServiceInput = {
  ownerUserId: string;
  languageId: string;
  actorUserId: string;
  idempotencyKey: string;
};

export async function resetSandboxForOwner(
  db: DbClient,
  input: ResetSandboxServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.reset",
      key: input.idempotencyKey,
      payload: {},
    },
    async (tx) => {
      const account = await getOrCreateSandbox(
        tx,
        input.ownerUserId,
        input.languageId,
      );
      const level1Id = await findLevel1Id(tx, input.languageId);
      await resetSandbox(tx, {
        sandboxUserId: account.sandboxUserId,
        level1Id,
      });
      // "Reset clears only the current owner's sandbox state" — the simulated
      // clock is part of that state, so it returns to the present too.
      await setSandboxTimeOffset(tx, account.sandboxUserId, 0);
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_RESET",
        resourceType: "sandbox",
        resourceId: account.sandboxUserId,
      });
    },
  );
}

export type SetSandboxCurriculumModeServiceInput = {
  ownerUserId: string;
  languageId: string;
  curriculumMode: CurriculumMode;
  selectedVocabularyGroupId?: string | null;
  actorUserId: string;
  idempotencyKey: string;
};

/**
 * Spec 16 — switching the *persona's* curriculum mode.
 *
 * Writes the persona's own `user_language_settings` row through the same
 * repository the learner-facing screen uses, so the sandbox exercises the
 * real storage rather than a parallel one. The admin's own preference is
 * untouched by construction: the only user id written is the persona's,
 * resolved here from ownership rather than accepted from the caller.
 */
export async function setSandboxCurriculumMode(
  db: DbClient,
  input: SetSandboxCurriculumModeServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.set-curriculum-mode",
      key: input.idempotencyKey,
      payload: {
        curriculumMode: input.curriculumMode,
        selectedVocabularyGroupId: input.selectedVocabularyGroupId ?? null,
      },
    },
    async (tx) => {
      const account = await getOrCreateSandbox(
        tx,
        input.ownerUserId,
        input.languageId,
      );
      const previous = await findLanguageSettings(
        tx,
        account.sandboxUserId,
        input.languageId,
      );
      await saveCurriculumPreference(tx, {
        userId: account.sandboxUserId,
        languageId: input.languageId,
        curriculumMode: input.curriculumMode,
        selectedVocabularyGroupId: input.selectedVocabularyGroupId ?? null,
      });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_CURRICULUM_MODE_CHANGED",
        resourceType: "sandbox",
        resourceId: account.sandboxUserId,
        beforeData: previous
          ? {
              curriculumMode: previous.curriculumMode,
              selectedVocabularyGroupId: previous.selectedVocabularyGroupId,
            }
          : null,
        afterData: {
          curriculumMode: input.curriculumMode,
          selectedVocabularyGroupId: input.selectedVocabularyGroupId ?? null,
        },
      });
    },
  );
}

/**
 * Spec 16's "previewing lesson selection under each mode" — read-only.
 *
 * Runs `domains/lessons`' real `selectLessonBatch` over the persona's real
 * eligible curriculum, once per mode, rather than describing what each mode
 * would probably do. That is the whole value of the preview: if the
 * selection rules change, this changes with them, because it is the same
 * function the learner's lesson goes through.
 *
 * Nothing is written, including the theme used for the Theme-mode row: when
 * the persona has not chosen one, the first available theme stands in for
 * the preview only.
 */
export async function previewSandboxCurriculum(
  db: DbClient,
  ownerUserId: string,
  languageId: string,
): Promise<SandboxCurriculumPreview> {
  const account = await getOrCreateSandbox(db, ownerUserId, languageId);
  const [settings, eligibleItems] = await Promise.all([
    findLanguageSettings(db, account.sandboxUserId, languageId),
    getEligibleLessonItems(db, account.sandboxUserId, languageId),
  ]);

  const availableThemes = getAvailableThemes(eligibleItems);
  const remainingByTheme = new Map<string, number>();
  for (const item of eligibleItems) {
    if (item.type !== "vocabulary" || !item.theme) continue;
    remainingByTheme.set(
      item.theme.id,
      (remainingByTheme.get(item.theme.id) ?? 0) + 1,
    );
  }

  const previewThemeId =
    settings?.selectedVocabularyGroupId ?? availableThemes[0]?.id ?? null;
  const batchSize = settings?.lessonBatchSize ?? DEFAULT_LESSON_BATCH_SIZE;

  return {
    currentMode: settings?.curriculumMode ?? null,
    selectedThemeId: settings?.selectedVocabularyGroupId ?? null,
    themes: availableThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      remainingCount: remainingByTheme.get(theme.id) ?? 0,
    })),
    batchesByMode: CURRICULUM_MODES.map((mode) => ({
      mode,
      items: selectLessonBatch({
        eligibleItems,
        batchSize,
        mode,
        selectedThemeId: previewThemeId,
      }).map((item) => ({
        id: item.id,
        label: item.type === "vocabulary" ? item.word : item.structure,
        type: item.type,
        themeName:
          item.type === "vocabulary" ? (item.theme?.name ?? null) : null,
      })),
    })),
  };
}
