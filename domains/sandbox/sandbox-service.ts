import type { DbClient } from "@/db/client";
import { recordAuditEvent } from "@/domains/admin/audit-repository";
import { getLevelByLanguageAndNumber } from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
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
import type { SandboxAccount, SandboxSnapshot } from "./sandbox-types";

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
  const level1 = await getLevelByLanguageAndNumber(db, languageId, 1);
  if (!level1) throw new AdminError("SANDBOX_OPERATION_FORBIDDEN", "Level 1 is not configured for this language yet.");
  return level1.id;
}

export async function getOrCreateSandbox(db: DbClient, ownerUserId: string, languageId: string): Promise<SandboxAccount> {
  const existing = await findSandboxByOwner(db, ownerUserId);
  if (existing) return existing;

  const level1Id = await findLevel1Id(db, languageId);
  return createSandboxForOwner(db, { ownerUserId, languageId, level1Id });
}

export async function getSandboxSnapshotForOwner(db: DbClient, ownerUserId: string, languageId: string): Promise<SandboxSnapshot> {
  const account = await getOrCreateSandbox(db, ownerUserId, languageId);
  return getSandboxSnapshot(db, account);
}

export type SimulateLevelServiceInput = { ownerUserId: string; languageId: string; levelId: string; actorUserId: string; idempotencyKey: string };

export async function simulateLevelForSandbox(db: DbClient, input: SimulateLevelServiceInput): Promise<void> {
  return withIdempotency(
    db,
    { userId: input.actorUserId, operation: "admin.sandbox.simulate-level", key: input.idempotencyKey, payload: { levelId: input.levelId } },
    async (tx) => {
      const account = await getOrCreateSandbox(tx, input.ownerUserId, input.languageId);
      await simulateLevel(tx, { sandboxUserId: account.sandboxUserId, levelId: input.levelId });
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

export async function setSandboxItemStage(db: DbClient, input: SetSandboxItemStageServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.sandbox.set-item-stage",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, srsStage: input.srsStage },
    },
    async (tx) => {
      const account = await getOrCreateSandbox(tx, input.ownerUserId, input.languageId);
      await setItemSrsStage(tx, { sandboxUserId: account.sandboxUserId, learningItemId: input.learningItemId, languageId: input.languageId, srsStage: input.srsStage });
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

export type MakeSandboxReviewsDueServiceInput = { ownerUserId: string; languageId: string; actorUserId: string; idempotencyKey: string };

export async function makeSandboxReviewsDue(db: DbClient, input: MakeSandboxReviewsDueServiceInput): Promise<void> {
  return withIdempotency(
    db,
    { userId: input.actorUserId, operation: "admin.sandbox.make-reviews-due", key: input.idempotencyKey, payload: {} },
    async (tx) => {
      const account = await getOrCreateSandbox(tx, input.ownerUserId, input.languageId);
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

export type ResetSandboxServiceInput = { ownerUserId: string; languageId: string; actorUserId: string; idempotencyKey: string };

export async function resetSandboxForOwner(db: DbClient, input: ResetSandboxServiceInput): Promise<void> {
  return withIdempotency(
    db,
    { userId: input.actorUserId, operation: "admin.sandbox.reset", key: input.idempotencyKey, payload: {} },
    async (tx) => {
      const account = await getOrCreateSandbox(tx, input.ownerUserId, input.languageId);
      const level1Id = await findLevel1Id(tx, input.languageId);
      await resetSandbox(tx, { sandboxUserId: account.sandboxUserId, level1Id });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "SANDBOX_RESET",
        resourceType: "sandbox",
        resourceId: account.sandboxUserId,
      });
    },
  );
}
