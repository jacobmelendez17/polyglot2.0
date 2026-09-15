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
import { FIXTURE_LEVEL_NUMBER, FIXTURE_NEXT_LEVEL_NUMBER, seedTestFixtures } from "@/db/seed/test-fixtures";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getStageIndex } from "@/domains/srs";

import {
  applyItemProgressUpdate,
  countLevelGatingItems,
  countProgressForItems,
  countUserItemsAtOrAboveStageInLevel,
  deleteItemProgressByIds,
  deleteLevelUnlocksAboveLevel,
  getDueReviewItems,
  getItemProgress,
  getItemProgressAboveLevel,
  getLevelProgress,
  getNextUpcomingReviewAt,
  getResetCandidateItems,
  getUnlockedLevels,
  getUpcomingReviewForecast,
  getUserProgressForLanguage,
  hasItemProgress,
  lockItemProgressForReview,
  reconcileFluentSchedules,
  resetItemProgressToBeginner,
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
      // Spec 20 Leeches — maintained transactionally with everything else here.
      expect(updated?.currentCorrectStreak).toBe(before!.currentCorrectStreak + 1);
      expect(getStageIndex(updated!.highestSrsStageReached)).toBe(Math.max(getStageIndex(before!.highestSrsStageReached), getStageIndex("beginner_3")));

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
      // Spec 20 Leeches — a penalized result always resets the correct streak, regardless of what it was.
      expect(updated?.currentCorrectStreak).toBe(0);
    });
  });

  it("applyItemProgressUpdate's highestSrsStageReached only ever moves forward, even through a later demotion (spec 20 Leeches)", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const before = await lockItemProgressForReview(tx, { userId: learnerId, learningItemId: gatoId, languageId });

      const reachedMaster = await applyItemProgressUpdate(tx, {
        userId: learnerId,
        learningItemId: gatoId,
        expectedVersion: before!.version,
        srsStage: "master",
        nextReviewAt: new Date("2026-03-01T00:00:00Z"),
        fluentAt: null,
        result: "advanced",
        now: new Date("2026-02-01T00:00:00Z"),
      });
      expect(reachedMaster?.highestSrsStageReached).toBe("master");

      const laterDemoted = await applyItemProgressUpdate(tx, {
        userId: learnerId,
        learningItemId: gatoId,
        expectedVersion: reachedMaster!.version,
        srsStage: "beginner_4",
        nextReviewAt: new Date("2026-02-03T00:00:00Z"),
        fluentAt: null,
        result: "penalized",
        now: new Date("2026-02-02T00:00:00Z"),
      });

      expect(laterDemoted?.srsStage).toBe("beginner_4");
      // The spec's own example: reached Master, later fell to Beginner 4 — highestSrsStageReached still reflects Master.
      expect(laterDemoted?.highestSrsStageReached).toBe("master");
    });
  });

  it("countLevelGatingItems counts published items only, never pending or archived ones", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      // A level of this test's own, with one of each status. Counting the
      // shared fixture level instead made this assert how much real
      // curriculum happens to be published there (`TEST_DATABASE_URL` and
      // `DATABASE_URL` are the same database), which is not the rule under
      // test.
      const [level] = await tx.insert(levels).values({ languageId, levelNumber: 71, name: "Gating fixture" }).returning();
      await tx.insert(learningItems).values([
        { languageId, levelId: level!.id, type: "grammar", status: "published", position: 1, lessonPriority: 1 },
        { languageId, levelId: level!.id, type: "grammar", status: "published", position: 2, lessonPriority: 2 },
        // Neither of these can ever be taught, so neither may raise the bar
        // a learner has to clear to unlock the next level.
        { languageId, levelId: level!.id, type: "grammar", status: "pending", position: 3, lessonPriority: 3 },
        { languageId, levelId: level!.id, type: "grammar", status: "archived", position: 4, lessonPriority: 4 },
      ]);

      expect(await countLevelGatingItems(tx, level!.id)).toBe(2);
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
    const { learnerId, gatoId, languageId } = await seedTestFixtures(testDb, { committed: true });
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

describe("getNextUpcomingReviewAt", () => {
  it("returns the earliest nextReviewAt strictly after now, ignoring already-due items", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId, aguaId } = await seedTestFixtures(tx);
      const now = new Date("2026-01-01T00:00:00Z");

      await tx.insert(userItemProgress).values([
        { userId: learnerId, learningItemId: casaId, languageId, srsStage: "beginner_1", nextReviewAt: new Date(now.getTime() - 60_000) }, // already due
        { userId: learnerId, learningItemId: aguaId, languageId, srsStage: "beginner_1", nextReviewAt: new Date(now.getTime() + 3600_000) }, // +1h
      ]);

      expect(await getNextUpcomingReviewAt(tx, learnerId, languageId, now)).toEqual(new Date(now.getTime() + 3600_000));
    });
  });

  it("returns null when nothing is scheduled after now", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      expect(await getNextUpcomingReviewAt(tx, learnerId, languageId, new Date())).toBeNull();
    });
  });
});

describe("getUpcomingReviewForecast", () => {
  it("returns items becoming due within the window, with their type, excluding already-due and out-of-window items", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId, grammarYId } = await seedTestFixtures(tx);
      const now = new Date("2026-01-01T00:00:00Z");
      const inWindow = new Date(now.getTime() + 3600_000);
      const outsideWindow = new Date(now.getTime() + 10 * 24 * 3600_000);
      const alreadyDue = new Date(now.getTime() - 60_000);

      // gato already has a seeded progress row — reuse it for the
      // already-due case instead of a second insert for the same item.
      await tx
        .update(userItemProgress)
        .set({ nextReviewAt: alreadyDue })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      await tx.insert(userItemProgress).values([
        { userId: learnerId, learningItemId: casaId, languageId, srsStage: "beginner_1", nextReviewAt: outsideWindow },
        { userId: learnerId, learningItemId: grammarYId, languageId, srsStage: "beginner_1", nextReviewAt: inWindow },
      ]);

      const forecast = await getUpcomingReviewForecast(tx, learnerId, languageId, { after: now, until: new Date(now.getTime() + 7 * 24 * 3600_000) });

      expect(forecast).toHaveLength(1);
      expect(forecast[0]).toMatchObject({ nextReviewAt: inWindow, itemType: "grammar" });
    });
  });
});

describe("countProgressForItems", () => {
  it("counts only items the user actually has a progress row for, and returns 0 for an empty id list", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, casaId, aguaId } = await seedTestFixtures(tx);
      // Only gato has a seeded progress row for this user; casa/agua have none.
      expect(await countProgressForItems(tx, learnerId, [gatoId, casaId, aguaId])).toBe(1);
      expect(await countProgressForItems(tx, learnerId, [])).toBe(0);
    });
  });
});

describe("reconcileFluentSchedules (spec 20 Fluent Mode)", () => {
  it("enabling schedules a maintenance review anchored to fluentAt (not now), only for terminal Fluent items of the matching content type", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId, grammarYId } = await seedTestFixtures(tx);
      const fluentAt = new Date("2026-01-01T00:00:00Z");

      await tx.insert(userItemProgress).values([
        { userId: learnerId, learningItemId: casaId, languageId, srsStage: "fluent", nextReviewAt: null, fluentAt },
        { userId: learnerId, learningItemId: grammarYId, languageId, srsStage: "fluent", nextReviewAt: null, fluentAt },
      ]);

      await reconcileFluentSchedules(tx, { userId: learnerId, languageId, itemType: "vocabulary", fluentModeEnabled: true });

      const casaProgress = await getItemProgress(tx, learnerId, casaId);
      expect(casaProgress?.nextReviewAt).toEqual(new Date("2026-07-01T00:00:00Z"));

      // grammarYId is a different content type — untouched by the vocabulary-scoped call.
      const grammarProgress = await getItemProgress(tx, learnerId, grammarYId);
      expect(grammarProgress?.nextReviewAt).toBeNull();
    });
  });

  it("disabling nulls out only Fluent-stage items with a live schedule, of the matching content type", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId, grammarYId } = await seedTestFixtures(tx);
      const scheduled = new Date("2026-07-01T00:00:00Z");

      await tx.insert(userItemProgress).values([
        { userId: learnerId, learningItemId: casaId, languageId, srsStage: "fluent", nextReviewAt: scheduled, fluentAt: new Date("2026-01-01T00:00:00Z") },
        { userId: learnerId, learningItemId: grammarYId, languageId, srsStage: "fluent", nextReviewAt: scheduled, fluentAt: new Date("2026-01-01T00:00:00Z") },
      ]);

      await reconcileFluentSchedules(tx, { userId: learnerId, languageId, itemType: "vocabulary", fluentModeEnabled: false });

      expect((await getItemProgress(tx, learnerId, casaId))?.nextReviewAt).toBeNull();
      // grammarYId untouched — different content type.
      expect((await getItemProgress(tx, learnerId, grammarYId))?.nextReviewAt).toEqual(scheduled);
    });
  });

  it("never touches a non-Fluent scheduled review", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId } = await seedTestFixtures(tx);
      const scheduled = new Date("2026-07-01T00:00:00Z");
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: casaId, languageId, srsStage: "beginner_2", nextReviewAt: scheduled });

      await reconcileFluentSchedules(tx, { userId: learnerId, languageId, itemType: "vocabulary", fluentModeEnabled: false });

      expect((await getItemProgress(tx, learnerId, casaId))?.nextReviewAt).toEqual(scheduled);
    });
  });

  it("is idempotent — a second enable call makes no further change once a maintenance schedule is already set", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId } = await seedTestFixtures(tx);
      const fluentAt = new Date("2026-01-01T00:00:00Z");
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: casaId, languageId, srsStage: "fluent", nextReviewAt: null, fluentAt });

      await reconcileFluentSchedules(tx, { userId: learnerId, languageId, itemType: "vocabulary", fluentModeEnabled: true });
      const afterFirst = (await getItemProgress(tx, learnerId, casaId))?.nextReviewAt;

      await reconcileFluentSchedules(tx, { userId: learnerId, languageId, itemType: "vocabulary", fluentModeEnabled: true });
      const afterSecond = (await getItemProgress(tx, learnerId, casaId))?.nextReviewAt;

      expect(afterSecond).toEqual(afterFirst);
    });
  });
});

describe("progress repository — Danger Zone Resets (spec 20 unit 21)", () => {
  describe("getResetCandidateItems", () => {
    it("returns only enrolled items of the requested content type, with the item's level number", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, languageId, gatoId, grammarYId, casaId } = await seedTestFixtures(tx);
        // gato already has progress from the fixture; enroll casa too and give grammarY progress, to prove the type filter excludes it.
        await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: casaId, languageId, srsStage: "beginner_1" });
        await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: grammarYId, languageId, srsStage: "beginner_1" });

        const vocabularyCandidates = await getResetCandidateItems(tx, learnerId, languageId, "vocabulary");
        expect(vocabularyCandidates.map((item) => item.learningItemId).sort()).toEqual([casaId, gatoId].sort());
        expect(vocabularyCandidates.every((item) => item.levelNumber === FIXTURE_LEVEL_NUMBER)).toBe(true);

        const grammarCandidates = await getResetCandidateItems(tx, learnerId, languageId, "grammar");
        expect(grammarCandidates.map((item) => item.learningItemId)).toEqual([grammarYId]);
      });
    });

    it("narrows to one CEFR band when given one", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, languageId, gatoId, level1Id, level2Id, rojoId } = await seedTestFixtures(tx);
        // The shared dev/test database's committed `rojo` row predates the fixture level migration noted in
        // `test-fixtures.ts` and still points at the real Level 1, not `level2Id` — corrected here, scoped to this
        // rolled-back transaction only, so this test's CEFR-band assertion reflects the fixture's own intended shape.
        await tx.update(learningItems).set({ levelId: level2Id }).where(eq(learningItems.id, rojoId));
        await tx.update(levels).set({ cefrLevel: "A1" }).where(eq(levels.id, level1Id));
        await tx.update(levels).set({ cefrLevel: "A2" }).where(eq(levels.id, level2Id));
        await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: rojoId, languageId, srsStage: "beginner_1" });

        const a1Candidates = await getResetCandidateItems(tx, learnerId, languageId, "vocabulary", "A1");
        expect(a1Candidates.map((item) => item.learningItemId)).toEqual([gatoId]);

        const a2Candidates = await getResetCandidateItems(tx, learnerId, languageId, "vocabulary", "A2");
        expect(a2Candidates.map((item) => item.learningItemId)).toEqual([rojoId]);
      });
    });
  });

  describe("resetItemProgressToBeginner", () => {
    it("zeros every named SRS aggregate, schedules a fresh Beginner 1 review, and leaves everything else untouched", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, gatoId } = await seedTestFixtures(tx);
        const now = new Date("2026-06-01T12:00:00Z");
        await tx
          .update(userItemProgress)
          .set({
            srsStage: "master",
            correctCount: 9,
            incorrectCount: 3,
            reviewCount: 12,
            currentCorrectStreak: 5,
            highestSrsStageReached: "master",
            fluentAt: new Date("2026-01-01T00:00:00Z"),
            lastReviewedAt: new Date("2026-05-01T00:00:00Z"),
          })
          .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

        await resetItemProgressToBeginner(tx, { userId: learnerId, items: [{ learningItemId: gatoId, levelNumber: FIXTURE_LEVEL_NUMBER }], now });

        const progress = await getItemProgress(tx, learnerId, gatoId);
        expect(progress?.srsStage).toBe("beginner_1");
        expect(progress?.correctCount).toBe(0);
        expect(progress?.incorrectCount).toBe(0);
        expect(progress?.reviewCount).toBe(0);
        expect(progress?.currentCorrectStreak).toBe(0);
        expect(progress?.highestSrsStageReached).toBe("beginner_1");
        expect(progress?.fluentAt).toBeNull();
        // Fixture level 90 is not one of the Level 1-2 accelerated levels, so the standard 4-hour Beginner 1 interval applies.
        expect(progress?.nextReviewAt).toEqual(new Date(now.getTime() + 4 * 60 * 60 * 1000));
        // Not named by the spec's reset field list — left exactly as it was.
        expect(progress?.lastReviewedAt).toEqual(new Date("2026-05-01T00:00:00Z"));

        // Durable history/notes/synonyms/enrollment are never touched by this function.
        const [note] = await tx.select().from(userNotes).where(and(eq(userNotes.userId, learnerId), eq(userNotes.learningItemId, gatoId)));
        expect(note).toBeDefined();
        const [synonym] = await tx
          .select()
          .from(userSynonyms)
          .where(and(eq(userSynonyms.userId, learnerId), eq(userSynonyms.learningItemId, gatoId)));
        expect(synonym).toBeDefined();
      });
    });

    it("applies the Level 1-2 accelerated interval when the item's level is 1 or 2", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, gatoId } = await seedTestFixtures(tx);
        const now = new Date("2026-06-01T12:00:00Z");

        await resetItemProgressToBeginner(tx, { userId: learnerId, items: [{ learningItemId: gatoId, levelNumber: 1 }], now });

        const progress = await getItemProgress(tx, learnerId, gatoId);
        expect(progress?.nextReviewAt).toEqual(new Date(now.getTime() + 2 * 60 * 60 * 1000));
      });
    });
  });

  describe("Reset to Level primitives", () => {
    it("getItemProgressAboveLevel finds only items whose level is strictly above the threshold", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, languageId, rojoId, level2Id } = await seedTestFixtures(tx);
        // See the CEFR-band test above for why this correction is needed.
        await tx.update(learningItems).set({ levelId: level2Id }).where(eq(learningItems.id, rojoId));
        await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: rojoId, languageId, srsStage: "beginner_1" });

        // gato (fixture's default progress row) sits at the fixture level itself, not above it — excluded either way.
        const above = await getItemProgressAboveLevel(tx, learnerId, languageId, FIXTURE_LEVEL_NUMBER);
        expect(above.map((item) => item.learningItemId)).toEqual([rojoId]);

        const aboveEverything = await getItemProgressAboveLevel(tx, learnerId, languageId, FIXTURE_NEXT_LEVEL_NUMBER);
        expect(aboveEverything).toEqual([]);
      });
    });

    it("deleteItemProgressByIds removes exactly the given rows and nothing else", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, languageId, gatoId, rojoId } = await seedTestFixtures(tx);
        await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: rojoId, languageId, srsStage: "beginner_1" });

        await deleteItemProgressByIds(tx, learnerId, [rojoId]);

        expect(await getItemProgress(tx, learnerId, rojoId)).toBeNull();
        expect(await getItemProgress(tx, learnerId, gatoId)).not.toBeNull();
      });
    });

    it("deleteLevelUnlocksAboveLevel removes only unlocks for Levels above the threshold", async () => {
      await withTestTransaction(async (tx) => {
        const { learnerId, languageId, level1Id, level2Id } = await seedTestFixtures(tx);
        await unlockLevel(tx, { userId: learnerId, levelId: level2Id, now: new Date() });

        await deleteLevelUnlocksAboveLevel(tx, learnerId, languageId, FIXTURE_LEVEL_NUMBER);

        const unlocked = await getUnlockedLevels(tx, learnerId, languageId);
        expect(unlocked.map((progress) => progress.levelId)).toEqual([level1Id]);
      });
    });
  });
});
