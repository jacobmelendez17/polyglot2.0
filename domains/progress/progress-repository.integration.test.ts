import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  idempotencyKeys,
  languages,
  learningItems,
  levels,
  userItemProgress,
  userLevelProgress,
  userNotes,
  users,
  userSynonyms,
} from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  applyItemProgressUpdate,
  countLevelGatingItems,
  countUserItemsAtOrAboveStageInLevel,
  getDueReviewItems,
  getItemProgress,
  getLevelProgress,
  getUnlockedLevels,
  getUserProgressForLanguage,
  hasItemProgress,
  lockItemProgressForReview,
  unlockLevel,
} from "./repository";

describe("progress repository", () => {
  it("returns exactly one progress record for a user/item combination", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const progress = await getItemProgress(tx, learnerId, gatoId);

      expect(progress?.userId).toBe(learnerId);
      expect(progress?.learningItemId).toBe(gatoId);
      expect(progress?.languageId).toBe(languageId);
      expect(progress?.srsStage).toBe("beginner_2");
    });
  });

  it("enforces one progress row per user/item combination at the database level", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await expect(
        tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: gatoId, languageId, srsStage: "beginner_1" }),
      ).rejects.toThrow();
    });
  });

  it("hasItemProgress reflects whether a progress row exists", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, casaId } = await seedTestFixtures(tx);
      expect(await hasItemProgress(tx, learnerId, gatoId)).toBe(true);
      expect(await hasItemProgress(tx, learnerId, casaId)).toBe(false);
    });
  });

  it("keeps progress for User A separate from User B", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, gatoId, languageId } = await seedTestFixtures(tx);
      expect(await hasItemProgress(tx, learnerId, gatoId)).toBe(true);
      expect(await hasItemProgress(tx, developerId, gatoId)).toBe(false);

      const developerProgress = await getUserProgressForLanguage(tx, developerId, languageId);
      expect(developerProgress).toEqual([]);
    });
  });

  it("keeps progress for one language from affecting another", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const [otherLanguage] = await tx.insert(languages).values({ code: "other-lang", slug: "other-lang", name: "Other" }).returning();
      await tx.insert(levels).values({ languageId: otherLanguage.id, levelNumber: 1 });

      const learnerOtherLanguageProgress = await getUserProgressForLanguage(tx, learnerId, otherLanguage.id);
      expect(learnerOtherLanguageProgress).toEqual([]);

      const learnerDefaultLanguageProgress = await getUserProgressForLanguage(tx, learnerId, languageId);
      expect(learnerDefaultLanguageProgress.map((p) => p.learningItemId)).toContain(gatoId);
    });
  });

  it("rejects a progress row whose language_id disagrees with its learning item's language", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId } = await seedTestFixtures(tx);
      const [otherLanguage] = await tx.insert(languages).values({ code: "other-lang-2", slug: "other-lang-2", name: "Other 2" }).returning();

      await expect(
        tx.insert(userItemProgress).values({
          userId: learnerId,
          learningItemId: gatoId,
          languageId: otherLanguage.id,
          srsStage: "beginner_1",
        }),
      ).rejects.toThrow();
    });
  });

  it("stores no SRS state on curriculum rows — progress lives only in user_item_progress", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);
      const [row] = await tx.select().from(learningItems).where(eq(learningItems.id, gatoId));
      expect(row).not.toHaveProperty("srsStage");
      expect(row).not.toHaveProperty("nextReviewAt");
    });
  });

  it("has no progress row for an unlocked-but-not-learned item", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId } = await seedTestFixtures(tx);
      // casa is in the learner's unlocked Level 1 but was never enrolled —
      // seedTestFixtures only creates progress for gato.
      expect(await hasItemProgress(tx, learnerId, casaId)).toBe(false);
    });
  });

  it("persists level unlock state independently of item progress", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, level1Id } = await seedTestFixtures(tx);
      const unlock = await getLevelProgress(tx, learnerId, level1Id);
      expect(unlock?.unlockedAt).toBeInstanceOf(Date);
      expect(unlock?.completedAt).toBeNull();
    });
  });

  it("keeps an earned unlock intact after a subsequent, unrelated progress change", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, level1Id, gatoId } = await seedTestFixtures(tx);
      await tx
        .update(userItemProgress)
        .set({ srsStage: "beginner_3" })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      const unlock = await getLevelProgress(tx, learnerId, level1Id);
      expect(unlock).not.toBeNull();
    });
  });

  it("lists every level a user has unlocked in one language", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, level1Id, languageId } = await seedTestFixtures(tx);
      const unlocked = await getUnlockedLevels(tx, learnerId, languageId);
      expect(unlocked.map((l) => l.levelId)).toEqual([level1Id]);
    });
  });

  it("can check the version field safely for optimistic concurrency", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId } = await seedTestFixtures(tx);
      const before = await getItemProgress(tx, learnerId, gatoId);
      expect(before?.version).toBe(0);

      // Reproduces the mechanism a future review-mutation would rely on: an
      // UPDATE guarded by `WHERE version = <the version the caller read>`.
      // A stale version must affect zero rows rather than silently applying.
      const staleUpdate = await tx
        .update(userItemProgress)
        .set({ srsStage: "beginner_3", version: 99 })
        .where(
          and(
            eq(userItemProgress.userId, learnerId),
            eq(userItemProgress.learningItemId, gatoId),
            eq(userItemProgress.version, 99), // wrong — the real current version is 0
          ),
        )
        .returning();
      expect(staleUpdate).toHaveLength(0);

      const freshUpdate = await tx
        .update(userItemProgress)
        .set({ srsStage: "beginner_3", version: (before?.version ?? 0) + 1 })
        .where(
          and(
            eq(userItemProgress.userId, learnerId),
            eq(userItemProgress.learningItemId, gatoId),
            eq(userItemProgress.version, before?.version ?? 0),
          ),
        )
        .returning();
      expect(freshUpdate).toHaveLength(1);

      const after = await getItemProgress(tx, learnerId, gatoId);
      expect(after?.version).toBe(1);
      expect(after?.srsStage).toBe("beginner_3");
    });
  });

  it("finds due-review items via the composite index, without scanning unrelated users", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, gatoId, casaId, languageId } = await seedTestFixtures(tx);
      const now = new Date();
      const past = new Date(now.getTime() - 60_000);
      const future = new Date(now.getTime() + 60_000);

      await tx
        .update(userItemProgress)
        .set({ nextReviewAt: past })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      await tx.insert(userItemProgress).values({
        userId: learnerId,
        learningItemId: casaId,
        languageId,
        srsStage: "beginner_1",
        nextReviewAt: future,
      });
      // A second user's due item must never appear in the first user's results.
      await tx.insert(userItemProgress).values({
        userId: developerId,
        learningItemId: casaId,
        languageId,
        srsStage: "beginner_1",
        nextReviewAt: past,
      });

      const due = await getDueReviewItems(tx, learnerId, languageId, now);
      expect(due.map((item) => item.learningItemId)).toEqual([gatoId]);
    });
  });

  it("never returns a due item from a different language, even for the same user (spec 09 §5/§23)", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = new Date();
      const past = new Date(now.getTime() - 60_000);

      await tx
        .update(userItemProgress)
        .set({ nextReviewAt: past })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      // A second language, with its own due item for the same learner.
      const [otherLanguage] = await tx
        .insert(languages)
        .values({ code: "fr-FR", slug: "french-review-filter-test", name: "French" })
        .returning();
      const [otherLevel] = await tx
        .insert(levels)
        .values({ languageId: otherLanguage!.id, levelNumber: 1, name: "Level 1", status: "published" })
        .returning();
      const [otherItem] = await tx
        .insert(learningItems)
        .values({
          languageId: otherLanguage!.id,
          levelId: otherLevel!.id,
          type: "vocabulary",
          status: "published",
          position: 1,
          lessonPriority: 1,
        })
        .returning();
      await tx.insert(userItemProgress).values({
        userId: learnerId,
        learningItemId: otherItem!.id,
        languageId: otherLanguage!.id,
        srsStage: "beginner_1",
        nextReviewAt: past,
      });

      const due = await getDueReviewItems(tx, learnerId, languageId, now);
      expect(due.map((item) => item.learningItemId)).toEqual([gatoId]);

      const dueOther = await getDueReviewItems(tx, learnerId, otherLanguage!.id, now);
      expect(dueOther.map((item) => item.learningItemId)).toEqual([otherItem!.id]);
    });
  });

  it("cascades a user's progress, notes, synonyms, and idempotency rows when the user is deleted", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, level1Id } = await seedTestFixtures(tx);

      await tx.delete(users).where(eq(users.id, learnerId));

      const [progressRow] = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      const [unlockRow] = await tx
        .select()
        .from(userLevelProgress)
        .where(and(eq(userLevelProgress.userId, learnerId), eq(userLevelProgress.levelId, level1Id)));
      const [noteRow] = await tx.select().from(userNotes).where(eq(userNotes.userId, learnerId));
      const [synonymRow] = await tx.select().from(userSynonyms).where(eq(userSynonyms.userId, learnerId));
      const [idempotencyRow] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.userId, learnerId));

      expect(progressRow).toBeUndefined();
      expect(unlockRow).toBeUndefined();
      expect(noteRow).toBeUndefined();
      expect(synonymRow).toBeUndefined();
      expect(idempotencyRow).toBeUndefined();
    });
  });
});

describe("progress repository — review-completion mutations (spec 09 unit 4)", () => {
  it("lockItemProgressForReview finds the row, and returns null for a wrong item or language", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);

      const locked = await lockItemProgressForReview(tx, { userId: learnerId, learningItemId: gatoId, languageId });
      expect(locked?.learningItemId).toBe(gatoId);

      const wrongItem = await lockItemProgressForReview(tx, {
        userId: learnerId,
        learningItemId: "00000000-0000-0000-0000-000000000000",
        languageId,
      });
      expect(wrongItem).toBeNull();

      const [otherLanguage] = await tx
        .insert(languages)
        .values({ code: "fr-FR", slug: "french-lock-test", name: "French" })
        .returning();
      const wrongLanguage = await lockItemProgressForReview(tx, {
        userId: learnerId,
        learningItemId: gatoId,
        languageId: otherLanguage!.id,
      });
      expect(wrongLanguage).toBeNull();
    });
  });

  it("applyItemProgressUpdate advances the counters/stage/version and returns null on a stale expectedVersion", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const before = await lockItemProgressForReview(tx, { userId: learnerId, learningItemId: gatoId, languageId });
      const now = new Date("2026-02-01T00:00:00Z");

      const updated = await applyItemProgressUpdate(tx, {
        userId: learnerId,
        learningItemId: gatoId,
        expectedVersion: before!.version,
        srsStage: "beginner_3",
        nextReviewAt: new Date("2026-02-02T00:00:00Z"),
        fluentAt: null,
        result: "advanced",
        now,
      });

      expect(updated?.srsStage).toBe("beginner_3");
      expect(updated?.correctCount).toBe(before!.correctCount + 1);
      expect(updated?.incorrectCount).toBe(before!.incorrectCount);
      expect(updated?.reviewCount).toBe(before!.reviewCount + 1);
      expect(updated?.lastReviewedAt).toEqual(now);
      expect(updated?.version).toBe(before!.version + 1);

      // The same (now stale) expectedVersion no longer matches.
      const staleAttempt = await applyItemProgressUpdate(tx, {
        userId: learnerId,
        learningItemId: gatoId,
        expectedVersion: before!.version,
        srsStage: "beginner_4",
        nextReviewAt: null,
        fluentAt: null,
        result: "advanced",
        now,
      });
      expect(staleAttempt).toBeNull();
    });
  });

  it("applyItemProgressUpdate increments incorrectCount, not correctCount, for a penalized result", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const before = await lockItemProgressForReview(tx, { userId: learnerId, learningItemId: gatoId, languageId });

      const updated = await applyItemProgressUpdate(tx, {
        userId: learnerId,
        learningItemId: gatoId,
        expectedVersion: before!.version,
        srsStage: "beginner_1",
        nextReviewAt: new Date("2026-02-02T00:00:00Z"),
        fluentAt: null,
        result: "penalized",
        now: new Date("2026-02-01T00:00:00Z"),
      });

      expect(updated?.correctCount).toBe(before!.correctCount);
      expect(updated?.incorrectCount).toBe(before!.incorrectCount + 1);
    });
  });

  it("countLevelGatingItems counts every learning item in the level", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id, level2Id } = await seedTestFixtures(tx);
      // Level 1 fixture: gato, casa, agua, grammar-y (4). Level 2: rojo (1).
      expect(await countLevelGatingItems(tx, level1Id)).toBe(4);
      expect(await countLevelGatingItems(tx, level2Id)).toBe(1);
    });
  });

  it("countUserItemsAtOrAboveStageInLevel only counts progress rows meeting the qualifying stage set", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, casaId, languageId, level1Id } = await seedTestFixtures(tx);
      await tx
        .update(userItemProgress)
        .set({ srsStage: "familiar_1" })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      await tx.insert(userItemProgress).values({
        userId: learnerId,
        learningItemId: casaId,
        languageId,
        srsStage: "beginner_2", // below the qualifying threshold
      });

      const count = await countUserItemsAtOrAboveStageInLevel(tx, {
        userId: learnerId,
        levelId: level1Id,
        qualifyingStages: ["familiar_1", "familiar_2", "intermediate", "master", "fluent"],
      });
      expect(count).toBe(1);
    });
  });

  it("unlockLevel is idempotent — a second call does not change the original unlockedAt", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, level2Id } = await seedTestFixtures(tx);
      const first = await unlockLevel(tx, { userId: learnerId, levelId: level2Id, now: new Date("2026-03-01T00:00:00Z") });
      const second = await unlockLevel(tx, { userId: learnerId, levelId: level2Id, now: new Date("2026-03-02T00:00:00Z") });

      expect(second.unlockedAt).toEqual(first.unlockedAt);
    });
  });

  it("a genuine two-connection concurrent completion applies exactly once — the loser's stale expectedVersion is rejected, not silently reapplied", async () => {
    const { learnerId, gatoId, languageId } = await seedTestFixtures(testDb);
    const original = await getItemProgress(testDb, learnerId, gatoId);
    if (!original) throw new Error("expected the seeded gato progress row to exist");

    try {
      const attempt = () =>
        testDb.transaction(async (tx) => {
          await lockItemProgressForReview(tx, { userId: learnerId, learningItemId: gatoId, languageId });
          await new Promise((resolve) => setTimeout(resolve, 150));
          return applyItemProgressUpdate(tx, {
            userId: learnerId,
            learningItemId: gatoId,
            expectedVersion: original.version,
            srsStage: "beginner_3",
            nextReviewAt: new Date(Date.now() + 60_000),
            fluentAt: null,
            result: "advanced",
            now: new Date(),
          });
        });

      const [a, b] = await Promise.all([attempt(), attempt()]);
      const results = [a, b];
      const applied = results.filter((r) => r !== null);
      const rejected = results.filter((r) => r === null);

      expect(applied).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    } finally {
      // Restore the shared fixture row to its original committed state.
      await testDb
        .update(userItemProgress)
        .set({
          srsStage: original.srsStage,
          nextReviewAt: original.nextReviewAt,
          version: original.version,
          correctCount: original.correctCount,
          reviewCount: original.reviewCount,
          lastReviewedAt: original.lastReviewedAt,
        })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
    }
  });
});
