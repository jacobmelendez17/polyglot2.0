import type { DbClient } from "@/db/client";
import { getLevelByLanguageAndNumber } from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import { resetAccountProgress } from "@/domains/progress/repository";
import {
  findLanguageSettings,
  saveCurriculumPreference,
} from "@/domains/users/user-repository";
import { AdminError } from "@/lib/errors/admin-errors";

import { recordAuditEvent } from "./audit-repository";

/**
 * Lets a signed-in admin/developer reset their own **real** account's
 * progress — distinct from `domains/sandbox`'s `resetSandboxForOwner`,
 * which only ever touches an isolated sandbox persona. This is for
 * repeatedly testing the live lesson/review flow on a real account without
 * needing a fresh user each time.
 *
 * Same shape as `resetSandboxForOwner`: `withIdempotency`-wrapped, one
 * audit event (architecture.md: "An admin may explicitly request a
 * progress reset... it must never occur silently" — the confirmation
 * dialog is the caller's job, this is the record of it happening).
 * Included in the same Level 1 lookup as the sandbox reset — `includeUnpublished`
 * so this still works while Level 1 is being authored/tested, same reasoning
 * as `sandbox-service.ts`'s own `findLevel1Id`.
 *
 * **Also clears an active Choose Group as You Go selection** (found
 * 2026-09-23, from a real report this exact gap produced): without this,
 * a group picked before the reset survives it untouched, and the very next
 * `startLesson` call silently honors that stale selection as "active" and
 * skips the "What next?" prompt — on what was supposed to be a genuinely
 * fresh start. Same reasoning, and the same clearing call, as
 * `domains/lessons/lesson-completion.ts`'s completion-time clearing; a
 * progress reset is at least as much a "this selection is no longer valid"
 * event as finishing a lesson is.
 */
export type ResetOwnAccountProgressServiceInput = {
  userId: string;
  languageId: string;
  idempotencyKey: string;
};

export async function resetOwnAccountProgress(
  db: DbClient,
  input: ResetOwnAccountProgressServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "admin.account.reset-progress",
      key: input.idempotencyKey,
      payload: {},
    },
    async (tx) => {
      const level1 = await getLevelByLanguageAndNumber(
        tx,
        input.languageId,
        1,
        { includeUnpublished: true },
      );
      if (!level1) throw new AdminError("LEVEL_ONE_NOT_CONFIGURED");

      await resetAccountProgress(tx, {
        userId: input.userId,
        level1Id: level1.id,
      });

      const settings = await findLanguageSettings(
        tx,
        input.userId,
        input.languageId,
      );
      if (
        settings?.curriculumMode === "choose_group" &&
        settings.selectedVocabularyGroupId !== null
      ) {
        await saveCurriculumPreference(tx, {
          userId: input.userId,
          languageId: input.languageId,
          curriculumMode: "choose_group",
          selectedVocabularyGroupId: null,
        });
      }

      await recordAuditEvent(tx, {
        actorUserId: input.userId,
        action: "ACCOUNT_PROGRESS_RESET",
        resourceType: "user",
        resourceId: input.userId,
      });
    },
  );
}
