import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  languages,
  learningItems,
  levels,
  userItemProgress,
  userLevelProgress,
  users,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getEligibleLessonItems, getLessonItemsByIds } from "@/domains/curriculum/lesson-curriculum-repository";
import { LessonError } from "@/lib/errors/lesson-errors";

import { completeLesson } from "./lesson-completion";
import type { LessonCurriculumReader } from "./lesson-curriculum-reader";
import { signLessonState } from "./lesson-token";
import type { LessonState } from "./lesson-types";

/**
 * Spec 07 unit 6 against the real database: atomic enrollment (§45), the
 * initial stage and schedule the SRS domain assigns (§46–§48), idempotent
 * replay (§49), and the already-enrolled rejection (§44).
 *
 * Every test builds its own language, level, group, items, and user, for the
 * reason `domains/lexicon`'s integration tests document at length:
 * `TEST_DATABASE_URL` currently shares a Neon branch with `DATABASE_URL`, so
 * counting rows is only meaningful inside a fixture that owns its own scope.
 */

let counter = 0;

async function seedLesson(tx: TestTx, options: { itemCount?: number; itemStatus?: "published" | "pending" } = {}) {
  counter += 1;
  const suffix = `${counter}${Math.floor(Math.random() * 100000)}`;
  const itemCount = options.itemCount ?? 3;

  const [language] = await tx
    .insert(languages)
    .values({ code: `es-L${suffix}`, slug: `spanish-lesson-${suffix}`, name: `Spanish (lesson ${suffix})` })
    .returning();
  const [level] = await tx
    .insert(levels)
    .values({ languageId: language.id, levelNumber: 1, name: "Level 1", status: "published" })
    .returning();
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({ levelId: level.id, languageId: language.id, name: "Basics", position: 1, status: "published" })
    .returning();
  const [user] = await tx
    .insert(users)
    .values({ clerkUserId: `lesson-test-${suffix}`, role: "user", activeLanguageId: language.id })
    .returning();
  // Real accounts get Level 1 unlocked at provisioning
  // (`domains/users/user-repository.ts`) — matched here since
  // `getEligibleLessonItems` now requires an explicit unlock (2026-09-07 fix).
  await tx.insert(userLevelProgress).values({ userId: user.id, levelId: level.id, unlockedAt: new Date() });

  const itemIds: string[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const [item] = await tx
      .insert(learningItems)
      .values({
        languageId: language.id,
        levelId: level.id,
        type: "vocabulary",
        status: options.itemStatus ?? "published",
        position: index + 1,
        lessonPriority: index + 1,
      })
      .returning();
    await tx.insert(vocabularyItems).values({
      learningItemId: item.id,
      vocabularyGroupId: group.id,
      term: `palabra${index}`,
      primaryMeaning: `word${index}`,
      partOfSpeech: "noun",
    });
    itemIds.push(item.id);
  }

  return { languageId: language.id, levelId: level.id, userId: user.id, itemIds, languageCode: language.code };
}

/** A signed token in the exact state a finished quiz leaves behind (§42). */
async function completedToken(input: {
  userId: string;
  languageId: string;
  languageCode: string;
  itemIds: string[];
  attempts?: number;
  correctAttempts?: number;
}): Promise<string> {
  const state: LessonState = {
    sessionId: crypto.randomUUID(),
    userId: input.userId,
    languageId: input.languageId,
    languageCode: input.languageCode,
    batch: input.itemIds.map((itemId) => ({ itemId, itemType: "vocabulary" as const })),
    viewedItemIds: input.itemIds,
    phase: "complete",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
    quiz: {
      questions: input.itemIds.map((itemId) => ({
        id: `q-${itemId}`,
        itemId,
        itemType: "vocabulary" as const,
        direction: "targetToEnglish" as const,
      })),
      satisfiedQuestionIds: input.itemIds.map((itemId) => `q-${itemId}`),
      queue: [],
      attempts: input.attempts ?? input.itemIds.length,
      correctAttempts: input.correctAttempts ?? input.itemIds.length,
    },
  };
  return signLessonState(state);
}

function readerFor(tx: TestTx): LessonCurriculumReader {
  return {
    getEligibleLearningItems: (userId, languageId) => getEligibleLessonItems(tx, userId, languageId),
    getLearningItemsByIds: (ids) => getLessonItemsByIds(tx, ids),
  };
}

describe("completeLesson", () => {
  it("enrolls the whole batch at the SRS domain's initial stage, with a scheduled first review", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const now = new Date("2026-03-01T12:00:00Z");

      const result = await completeLesson(tx, {
        curriculum: readerFor(tx),
        token: await completedToken(fixture),
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey: crypto.randomUUID(),
        now,
      });

      expect(result.enrolledItemIds).toEqual(fixture.itemIds);
      expect(result.newStage).toBe("beginner_1");

      const rows = await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, fixture.userId));
      expect(rows).toHaveLength(fixture.itemIds.length);
      for (const row of rows) {
        expect(row.srsStage).toBe("beginner_1");
        expect(row.languageId).toBe(fixture.languageId);
        expect(row.learnedAt).toEqual(now);
        // §47/§48 — the SRS domain scheduled it; the lesson domain did not
        // compute an interval of its own.
        expect(row.nextReviewAt).not.toBeNull();
        expect(row.nextReviewAt!.getTime()).toBeGreaterThan(now.getTime());
      }
    });
  });

  it("replays idempotently: the same key returns the original result and enrolls nothing further", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const token = await completedToken(fixture);
      const idempotencyKey = crypto.randomUUID();
      const input = {
        curriculum: readerFor(tx),
        token,
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey,
      };

      const first = await completeLesson(tx, input);
      const replay = await completeLesson(tx, input);

      expect(replay.enrolledItemIds).toEqual(first.enrolledItemIds);
      const rows = await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, fixture.userId));
      expect(rows).toHaveLength(fixture.itemIds.length);
    });
  });

  it("rejects an already-enrolled batch outright rather than enrolling the remainder", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);

      await completeLesson(tx, {
        curriculum: readerFor(tx),
        token: await completedToken(fixture),
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey: crypto.randomUUID(),
      });

      // A second completion of the same batch under a *different* key is a
      // genuine duplicate, not a replay — §44 requires the whole thing be
      // rejected, with no partial enrollment.
      const attempt = completeLesson(tx, {
        curriculum: readerFor(tx),
        token: await completedToken(fixture),
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(attempt).rejects.toThrow(LessonError);
      await expect(attempt.catch((error) => error)).resolves.toMatchObject({ code: "LESSON_ALREADY_ENROLLED" });
    });
  });

  it("enrolls nothing when one batch item is no longer published — all-or-nothing", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const token = await completedToken(fixture);

      // The item is unpublished between study and completion.
      await tx.update(learningItems).set({ status: "archived" }).where(eq(learningItems.id, fixture.itemIds[1]));

      const attempt = completeLesson(tx, {
        curriculum: readerFor(tx),
        token,
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey: crypto.randomUUID(),
      });
      await expect(attempt.catch((error) => error)).resolves.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });

      const rows = await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, fixture.userId));
      expect(rows).toHaveLength(0);
    });
  });

  it("refuses a token whose quiz never finished", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const state: LessonState = {
        sessionId: crypto.randomUUID(),
        userId: fixture.userId,
        languageId: fixture.languageId,
        languageCode: fixture.languageCode,
        batch: fixture.itemIds.map((itemId) => ({ itemId, itemType: "vocabulary" as const })),
        viewedItemIds: fixture.itemIds,
        phase: "complete",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        quiz: {
          questions: [{ id: "q1", itemId: fixture.itemIds[0], itemType: "vocabulary", direction: "targetToEnglish" }],
          satisfiedQuestionIds: [],
          // A pending question means the quiz did not finish (§41).
          queue: ["q1"],
          attempts: 1,
          correctAttempts: 0,
        },
      };

      const attempt = completeLesson(tx, {
        curriculum: readerFor(tx),
        token: await signLessonState(state),
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey: crypto.randomUUID(),
      });
      await expect(attempt.catch((error) => error)).resolves.toMatchObject({ code: "LESSON_QUIZ_NOT_READY" });

      const rows = await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, fixture.userId));
      expect(rows).toHaveLength(0);
    });
  });
});

describe("lesson curriculum reads", () => {
  it("excludes items the learner has already enrolled", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);

      const before = await getEligibleLessonItems(tx, fixture.userId, fixture.languageId);
      expect(before.map((item) => item.id).sort()).toEqual([...fixture.itemIds].sort());

      await completeLesson(tx, {
        curriculum: readerFor(tx),
        token: await completedToken(fixture),
        userId: fixture.userId,
        languageId: fixture.languageId,
        idempotencyKey: crypto.randomUUID(),
      });

      const after = await getEligibleLessonItems(tx, fixture.userId, fixture.languageId);
      expect(after).toHaveLength(0);
    });
  });

  it("never returns unpublished curriculum", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx, { itemStatus: "pending" });
      expect(await getEligibleLessonItems(tx, fixture.userId, fixture.languageId)).toHaveLength(0);
      expect(await getLessonItemsByIds(tx, fixture.itemIds)).toHaveLength(0);
    });
  });

  it("never returns items from an unpublished level, even when the items themselves are published", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      await tx.update(levels).set({ status: "draft" }).where(eq(levels.id, fixture.levelId));

      expect(await getEligibleLessonItems(tx, fixture.userId, fixture.languageId)).toHaveLength(0);
      expect(await getLessonItemsByIds(tx, fixture.itemIds)).toHaveLength(0);
    });
  });

  it("never returns items from a level the learner hasn't unlocked, even when the level and its items are both published (2026-09-07 fix)", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);

      const [level2] = await tx
        .insert(levels)
        .values({ languageId: fixture.languageId, levelNumber: 2, name: "Level 2", status: "published" })
        .returning();
      const [group2] = await tx
        .insert(vocabularyGroups)
        .values({ levelId: level2.id, languageId: fixture.languageId, name: "Level 2 basics", position: 1, status: "published" })
        .returning();
      const [level2Item] = await tx
        .insert(learningItems)
        .values({ languageId: fixture.languageId, levelId: level2.id, type: "vocabulary", status: "published", position: 1, lessonPriority: 1 })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: level2Item.id,
        vocabularyGroupId: group2.id,
        term: "segundo",
        primaryMeaning: "second",
        partOfSpeech: "adjective",
      });
      // Deliberately no `userLevelProgress` row for level2 — the learner has
      // not unlocked it.

      const eligible = await getEligibleLessonItems(tx, fixture.userId, fixture.languageId);
      expect(eligible.map((item) => item.id)).not.toContain(level2Item.id);
      expect(eligible.map((item) => item.id).sort()).toEqual([...fixture.itemIds].sort());

      // Unlocking level2 makes it (and only it) newly eligible.
      await tx.insert(userLevelProgress).values({ userId: fixture.userId, levelId: level2.id, unlockedAt: new Date() });
      const eligibleAfterUnlock = await getEligibleLessonItems(tx, fixture.userId, fixture.languageId);
      expect(eligibleAfterUnlock.map((item) => item.id)).toContain(level2Item.id);
    });
  });

  it("carries the level number the SRS domain schedules from", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const items = await getLessonItemsByIds(tx, fixture.itemIds);
      expect(items.every((item) => item.levelNumber === 1)).toBe(true);
      // A UUID here instead of a level number is the exact confusion the
      // `levelId` -> `levelNumber` rename exists to prevent.
      expect(typeof items[0].levelNumber).toBe("number");
    });
  });
});
