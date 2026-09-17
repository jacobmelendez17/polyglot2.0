import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { levels, users } from "@/db/schema";
import {
  DEVELOPER_ID,
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  LEVEL_2_ID,
  LEARNER_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getLevelByLanguageAndNumber } from "@/domains/curriculum/curriculum-repository";
import { getAuditEvents } from "@/domains/admin/audit-repository";
import {
  getItemProgress,
  getUnlockedLevels,
} from "@/domains/progress/repository";

/**
 * `getOrCreateSandbox`/`resetSandboxForOwner` deliberately anchor a sandbox
 * persona to the *application's* real Level 1 (`findLevel1Id` in
 * `sandbox-service.ts` resolves level number 1, not the fixture's own level
 * number 90) — a real persistent Neon branch always has one, since the real
 * curriculum starts there. An isolated test database does not, so any test
 * exercising first-time sandbox creation or reset needs to ensure one
 * exists (spec 22's "remove shared-database assumptions").
 *
 * `onConflictDoNothing`, not a plain insert: `user-repository.integration
 * .test.ts`'s own real-concurrency test commits this exact row
 * (`languageId`/levelNumber 1) permanently and deliberately, by the same
 * reasoning — real Level 1 is infrastructure every provisioning path needs,
 * not per-test fixture state — so it may already exist by the time this
 * runs. Scoped to this test's own rolled-back transaction either way; this
 * never touches `seedTestFixtures`' own levels (90/91).
 */
async function seedApplicationLevel1(
  tx: DbClient,
  languageId: string,
): Promise<void> {
  await tx
    .insert(levels)
    .values({
      languageId,
      levelNumber: 1,
      name: "Level 1",
      status: "published",
    })
    .onConflictDoNothing({ target: [levels.languageId, levels.levelNumber] });
}

import {
  getOrCreateSandbox,
  getSandboxSnapshotForOwner,
  makeSandboxReviewsDue,
  resetSandboxForOwner,
  setSandboxItemStage,
  simulateLevelForSandbox,
} from "./sandbox-service";

describe("getOrCreateSandbox", () => {
  // Uses LEARNER_ID, not DEVELOPER_ID, as the owner here specifically —
  // db/seed/test-fixtures.ts's real, permanently-committed seed data already
  // gives DEVELOPER_ID a pre-existing sandbox (SANDBOX_ID, seeded with no
  // level-unlock history of its own), which this test's "exactly Level 1,
  // nothing else" assertion needs a genuinely fresh owner to check.
  // LEARNER_ID has no sandbox of its own in that seed data.
  it("creates exactly one sandbox user for a first-time owner, with Level 1 already unlocked", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedApplicationLevel1(tx, languageId);
      // A sandbox persona is anchored to the *application's* Level 1, not to
      // the fixture's own level — `findLevel1Id` resolves level number 1
      // deliberately, so a persona starts where a real learner starts.
      const applicationLevel1 = await getLevelByLanguageAndNumber(
        tx,
        languageId,
        1,
        { includeUnpublished: true },
      );

      const account = await getOrCreateSandbox(tx, LEARNER_ID, languageId);
      expect(account.ownerUserId).toBe(LEARNER_ID);

      const [row] = await tx
        .select()
        .from(users)
        .where(eq(users.id, account.sandboxUserId));
      expect(row?.isSandbox).toBe(true);
      expect(row?.sandboxOwnerUserId).toBe(LEARNER_ID);
      expect(row?.clerkUserId).toBeNull();

      const unlocked = await getUnlockedLevels(
        tx,
        account.sandboxUserId,
        languageId,
      );
      expect(unlocked.map((l) => l.levelId)).toEqual([applicationLevel1!.id]);
    });
  });

  it("returns the same sandbox on repeated calls, never creating a second one", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const first = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      const second = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      expect(second.sandboxUserId).toBe(first.sandboxUserId);

      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.sandboxOwnerUserId, DEVELOPER_ID));
      expect(rows).toHaveLength(1);
    });
  });
});

describe("simulateLevelForSandbox", () => {
  it("unlocks the chosen level for the sandbox and records SANDBOX_LEVEL_SIMULATED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      await simulateLevelForSandbox(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        levelId: LEVEL_2_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const account = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      const unlocked = await getUnlockedLevels(
        tx,
        account.sandboxUserId,
        languageId,
      );
      expect(unlocked.map((l) => l.levelId)).toContain(LEVEL_2_ID);

      const audit = await getAuditEvents(tx, {
        action: "SANDBOX_LEVEL_SIMULATED",
        resourceId: account.sandboxUserId,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
    });
  });
});

describe("setSandboxItemStage", () => {
  it("sets a chosen item's SRS stage directly, without requiring a prior review", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      await setSandboxItemStage(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        learningItemId: ITEM_GATO_ID,
        srsStage: "familiar_1",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const account = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      const progress = await getItemProgress(
        tx,
        account.sandboxUserId,
        ITEM_GATO_ID,
      );
      expect(progress?.srsStage).toBe("familiar_1");
      expect(progress?.nextReviewAt).toBeNull();

      const audit = await getAuditEvents(tx, {
        action: "SANDBOX_STAGE_CHANGED",
        resourceId: ITEM_GATO_ID,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
    });
  });

  it("overwrites an existing stage rather than erroring on a second call", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await setSandboxItemStage(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        learningItemId: ITEM_GATO_ID,
        srsStage: "beginner_1",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      await setSandboxItemStage(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        learningItemId: ITEM_GATO_ID,
        srsStage: "master",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const account = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      const progress = await getItemProgress(
        tx,
        account.sandboxUserId,
        ITEM_GATO_ID,
      );
      expect(progress?.srsStage).toBe("master");
    });
  });
});

describe("makeSandboxReviewsDue", () => {
  it("sets nextReviewAt to now for every enrolled sandbox item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await setSandboxItemStage(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        learningItemId: ITEM_GATO_ID,
        srsStage: "familiar_1",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      await setSandboxItemStage(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        learningItemId: ITEM_CASA_ID,
        srsStage: "beginner_2",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await makeSandboxReviewsDue(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const account = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      const gato = await getItemProgress(
        tx,
        account.sandboxUserId,
        ITEM_GATO_ID,
      );
      const casa = await getItemProgress(
        tx,
        account.sandboxUserId,
        ITEM_CASA_ID,
      );
      expect(gato?.nextReviewAt).not.toBeNull();
      expect(casa?.nextReviewAt).not.toBeNull();
      expect(gato!.nextReviewAt!.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});

describe("resetSandboxForOwner", () => {
  it("clears the sandbox's own progress and re-establishes only the Level 1 starting state", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedApplicationLevel1(tx, languageId);
      const applicationLevel1 = await getLevelByLanguageAndNumber(
        tx,
        languageId,
        1,
        { includeUnpublished: true },
      );
      await simulateLevelForSandbox(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        levelId: LEVEL_2_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      await setSandboxItemStage(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        learningItemId: ITEM_GATO_ID,
        srsStage: "master",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await resetSandboxForOwner(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const account = await getOrCreateSandbox(tx, DEVELOPER_ID, languageId);
      const unlocked = await getUnlockedLevels(
        tx,
        account.sandboxUserId,
        languageId,
      );
      expect(unlocked.map((l) => l.levelId)).toEqual([applicationLevel1!.id]);
      expect(
        await getItemProgress(tx, account.sandboxUserId, ITEM_GATO_ID),
      ).toBeNull();

      const audit = await getAuditEvents(tx, {
        action: "SANDBOX_RESET",
        resourceId: account.sandboxUserId,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
    });
  });

  it("never touches a real learner's progress", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedApplicationLevel1(tx, languageId);
      // LEARNER_ID has real fixture progress on ITEM_GATO_ID (beginner_2).
      await resetSandboxForOwner(tx, {
        ownerUserId: DEVELOPER_ID,
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const learnerProgress = await getItemProgress(
        tx,
        LEARNER_ID,
        ITEM_GATO_ID,
      );
      expect(learnerProgress?.srsStage).toBe("beginner_2");
    });
  });
});

describe("getSandboxSnapshotForOwner", () => {
  // LEARNER_ID again — see getOrCreateSandbox's comment above for why
  // DEVELOPER_ID isn't a fresh owner in this shared database.
  it("reflects unlocked levels and item states together", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedApplicationLevel1(tx, languageId);
      await setSandboxItemStage(tx, {
        ownerUserId: LEARNER_ID,
        languageId,
        learningItemId: ITEM_GATO_ID,
        srsStage: "intermediate",
        actorUserId: LEARNER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const snapshot = await getSandboxSnapshotForOwner(
        tx,
        LEARNER_ID,
        languageId,
      );
      expect(snapshot.unlockedLevels.map((l) => l.levelNumber)).toEqual([1]);
      const gatoState = snapshot.items.find(
        (i) => i.learningItemId === ITEM_GATO_ID,
      );
      expect(gatoState?.srsStage).toBe("intermediate");
      expect(gatoState?.itemLabel).toBe("gato");
    });
  });
});
