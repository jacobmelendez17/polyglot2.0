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
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  getDueReviewItems,
  getItemProgress,
  getLevelProgress,
  getUnlockedLevels,
  getUserProgressForLanguage,
  hasItemProgress,
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
