import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  grammarItems,
  languages,
  learningItems,
  levels,
  userItemProgress,
  userLevelProgress,
  users,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import type { DbClient } from "@/db/client";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getDashboardData } from "./dashboard-service";

/**
 * End-to-end aggregation against a curriculum this test creates and owns.
 *
 * It used to read the seeded fixture Level 1 and assert exact counts against
 * it. That level is shared with the real curriculum — `TEST_DATABASE_URL`
 * and `DATABASE_URL` are the same database — so the moment a real word was
 * published there, "3 available lessons" became 4 and the aggregation looked
 * broken when it was right. Owning the data keeps every number exact and
 * permanently independent of what the curriculum happens to contain.
 */
type IsolatedLearner = { learnerId: string; languageId: string; levelId: string; gatoId: string };

async function seedIsolatedLearner(tx: DbClient): Promise<IsolatedLearner> {
  const unique = crypto.randomUUID();
  const [language] = await tx
    .insert(languages)
    .values({ code: `fixture-dash-${unique}`, slug: `fixture-dash-${unique}`, name: "Dashboard Fixture" })
    .returning();
  const languageId = language!.id;

  const [level] = await tx.insert(levels).values({ languageId, levelNumber: 1, name: "Level 1", status: "published" }).returning();
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({ levelId: level!.id, languageId, name: "Fixture group", position: 1, status: "published" })
    .returning();

  const inserted = await tx
    .insert(learningItems)
    .values([
      { languageId, levelId: level!.id, type: "vocabulary", status: "published", position: 1, lessonPriority: 1 },
      { languageId, levelId: level!.id, type: "vocabulary", status: "published", position: 2, lessonPriority: 2 },
      { languageId, levelId: level!.id, type: "vocabulary", status: "published", position: 3, lessonPriority: 3 },
      { languageId, levelId: level!.id, type: "grammar", status: "published", position: 1, lessonPriority: 4 },
    ])
    .returning({ id: learningItems.id });
  const [gatoId, casaId, aguaId, grammarId] = inserted.map((row) => row.id);

  await tx.insert(vocabularyItems).values([
    { learningItemId: gatoId!, vocabularyGroupId: group!.id, term: "gato", primaryMeaning: "cat", article: "el", partOfSpeech: "noun" },
    { learningItemId: casaId!, vocabularyGroupId: group!.id, term: "casa", primaryMeaning: "house", article: "la", partOfSpeech: "noun" },
    { learningItemId: aguaId!, vocabularyGroupId: group!.id, term: "agua", primaryMeaning: "water", article: "el", partOfSpeech: "noun" },
  ]);
  await tx.insert(grammarItems).values({
    learningItemId: grammarId!,
    structure: "y",
    primaryMeaning: "and",
    explanation: "Connects two words.",
    requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
  });

  const [learner] = await tx.insert(users).values({ activeLanguageId: languageId, role: "user" }).returning();
  await tx.insert(userLevelProgress).values({ userId: learner!.id, levelId: level!.id, unlockedAt: new Date() });
  // Exactly one item learned, with no review scheduled — the shape every
  // assertion below is derived from.
  await tx.insert(userItemProgress).values({
    userId: learner!.id,
    learningItemId: gatoId!,
    languageId,
    srsStage: "beginner_2",
    correctCount: 1,
    reviewCount: 1,
  });

  return { learnerId: learner!.id, languageId, levelId: level!.id, gatoId: gatoId! };
}
describe("getDashboardData", () => {
  it("aggregates real lessons/reviews/level-progress data for a partially-progressed learner", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedIsolatedLearner(tx);

      const data = await getDashboardData(tx, { userId: learnerId, languageId });

      // casa, agua, and the grammar item are all published, unenrolled, and
      // in Level 1, the learner's only unlocked level; gato is excluded
      // because the learner already has it, and rojo (Level 2) is excluded
      // because the learner hasn't unlocked Level 2 (2026-09-07 fix —
      // `getEligibleLessonItems` previously ignored level-unlock state
      // entirely, see progress-tracker.md's Next Up #20 turned Completed).
      expect(data.lessons.availableCount).toBe(3);

      // gato has no nextReviewAt in the seed data, so nothing is due or scheduled.
      expect(data.reviews).toEqual({ availableCount: 0, nextReviewAt: null });
      expect(data.forecast["24h"].every((bucket) => bucket.vocabularyCount === 0 && bucket.grammarCount === 0)).toBe(true);
      expect(data.reviewHistory["7d"].every((point) => point.completedCount === 0)).toBe(true);
      expect(data.levelProgress.streak.every((day) => !day.isActive)).toBe(true);

      // Level 1 is the learner's only unlocked level.
      expect(data.levelProgress.currentLevel).toBe(1);
      // Level 1 has 3 vocabulary items (gato/casa/agua); the learner has progress on 1 (gato).
      expect(data.levelProgress.vocabulary).toEqual({ learned: 1, total: 3 });
      // Level 1 has 1 grammar item; the learner has no progress on it.
      expect(data.levelProgress.grammar).toEqual({ learned: 0, total: 1 });
      expect(data.levelProgress.overall).toEqual({ learned: 1, total: 4 });
    });
  });

  it("reports the next upcoming review time when nothing is due yet, and reflects it in the forecast", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const now = new Date();

      await tx
        .update(userItemProgress)
        .set({ nextReviewAt: new Date(now.getTime() + 3 * 60 * 60 * 1000) }) // +3h, inside the 24h forecast window
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      const data = await getDashboardData(tx, { userId: learnerId, languageId });

      expect(data.reviews.availableCount).toBe(0);
      expect(data.reviews.nextReviewAt).not.toBeNull();
      const totalForecastCount = data.forecast["24h"].reduce((sum, bucket) => sum + bucket.vocabularyCount + bucket.grammarCount, 0);
      expect(totalForecastCount).toBe(1);
    });
  });

  it("defaults to level 1 with zero totals when the language has no levels at all", async () => {
    await withTestTransaction(async (tx) => {
      const [emptyLanguage] = await tx.insert(languages).values({ code: "xx-XX", slug: "empty-test-language", name: "Empty" }).returning();
      const [user] = await tx.insert(users).values({ activeLanguageId: emptyLanguage.id }).returning();

      const data = await getDashboardData(tx, { userId: user.id, languageId: emptyLanguage.id });

      expect(data.levelProgress.currentLevel).toBe(1);
      expect(data.levelProgress.vocabulary).toEqual({ learned: 0, total: 0 });
      expect(data.levelProgress.grammar).toEqual({ learned: 0, total: 0 });
      expect(data.lessons.availableCount).toBe(0);
    });
  });
});
