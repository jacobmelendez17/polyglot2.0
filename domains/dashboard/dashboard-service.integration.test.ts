import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, userItemProgress, users } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getDashboardData } from "./dashboard-service";

/**
 * End-to-end aggregation against real seeded data — `seedTestFixtures`
 * gives `learnerId` exactly one progress row (gato, beginner_2, no
 * scheduled review) and one unlocked level (Level 1: gato/casa/agua
 * vocabulary + one grammar item). Every number below is derived from that
 * exact fixture shape, not an approximation.
 */
describe("getDashboardData", () => {
  it("aggregates real lessons/reviews/level-progress data for a partially-progressed learner", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      const data = await getDashboardData(tx, { userId: learnerId, languageId });

      // casa, agua, the grammar item, and rojo (Level 2) are all published
      // and unenrolled; gato is excluded because the learner already has it.
      expect(data.lessons.availableCount).toBe(4);

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
