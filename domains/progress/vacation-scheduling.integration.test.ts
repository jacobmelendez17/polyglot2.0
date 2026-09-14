import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, learningItems, levels, userItemProgress, users, vocabularyGroups, vocabularyItems } from "@/db/schema";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { calculateVacationAdjustedReview } from "@/domains/srs";

import { applyVacationSchedulingAdjustment } from "./repository";

/**
 * Spec 20 General — Vacation Scheduling. Proves
 * `applyVacationSchedulingAdjustment`'s single SQL `UPDATE ... CASE`
 * produces exactly the same result, row for row, as
 * `domains/srs`'s pure `calculateVacationAdjustedReview` — the two express
 * the same rule in two different languages (SQL vs. TypeScript), and nothing
 * enforces they stay in agreement except this test.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function seedProgressFixture(
  tx: TestTx,
  items: { learnedAt: Date; lastReviewedAt: Date | null; nextReviewAt: Date | null }[],
) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const [language] = await tx
    .insert(languages)
    .values({ code: `es-V${suffix}`, slug: `spanish-vacation-${suffix}`, name: `Spanish (vacation ${suffix})` })
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
    .values({ clerkUserId: `vacation-sched-${suffix}`, role: "user", activeLanguageId: language.id })
    .returning();

  const progressIds: string[] = [];
  for (const [index, item] of items.entries()) {
    const [learningItem] = await tx
      .insert(learningItems)
      .values({
        languageId: language.id,
        levelId: level.id,
        type: "vocabulary",
        status: "published",
        position: index + 1,
        lessonPriority: index + 1,
      })
      .returning();
    await tx.insert(vocabularyItems).values({
      learningItemId: learningItem.id,
      vocabularyGroupId: group.id,
      term: `palabra${index}`,
      primaryMeaning: `word${index}`,
      partOfSpeech: "noun",
    });
    await tx.insert(userItemProgress).values({
      userId: user.id,
      learningItemId: learningItem.id,
      languageId: language.id,
      srsStage: "beginner_1",
      learnedAt: item.learnedAt,
      lastReviewedAt: item.lastReviewedAt,
      nextReviewAt: item.nextReviewAt,
    });
    progressIds.push(learningItem.id);
  }

  return { userId: user.id, learningItemIds: progressIds };
}

describe("applyVacationSchedulingAdjustment", () => {
  it("matches calculateVacationAdjustedReview for a wait that began before the vacation, one mid-vacation, and one already overdue", async () => {
    await withTestTransaction(async (tx) => {
      const vacationStartedAt = new Date("2026-03-01T00:00:00Z");
      const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);

      const preVacationWaitStart = new Date(vacationStartedAt.getTime() - 5 * DAY_MS);
      const preVacationNextReview = new Date(vacationStartedAt.getTime() + 3 * DAY_MS);

      const midVacationWaitStart = new Date(vacationStartedAt.getTime() + 5 * DAY_MS);
      const midVacationNextReview = new Date(midVacationWaitStart.getTime() + 4 * HOUR_MS);

      const overdueWaitStart = new Date(vacationStartedAt.getTime() - 20 * DAY_MS);
      const overdueNextReview = new Date(vacationStartedAt.getTime() - 2 * DAY_MS);

      const fixture = await seedProgressFixture(tx, [
        { learnedAt: preVacationWaitStart, lastReviewedAt: preVacationWaitStart, nextReviewAt: preVacationNextReview },
        { learnedAt: midVacationWaitStart, lastReviewedAt: null, nextReviewAt: midVacationNextReview },
        { learnedAt: overdueWaitStart, lastReviewedAt: overdueWaitStart, nextReviewAt: overdueNextReview },
      ]);

      await applyVacationSchedulingAdjustment(tx, fixture.userId, vacationStartedAt, vacationEndedAt);

      const rows = await tx
        .select()
        .from(userItemProgress)
        .where(inArray(userItemProgress.learningItemId, fixture.learningItemIds));
      const byItemId = new Map(rows.map((row) => [row.learningItemId, row]));

      const expectedPreVacation = calculateVacationAdjustedReview({
        nextReviewAt: preVacationNextReview,
        waitStartedAt: preVacationWaitStart,
        vacationStartedAt,
        vacationEndedAt,
      });
      const expectedMidVacation = calculateVacationAdjustedReview({
        nextReviewAt: midVacationNextReview,
        waitStartedAt: midVacationWaitStart,
        vacationStartedAt,
        vacationEndedAt,
      });
      const expectedOverdue = calculateVacationAdjustedReview({
        nextReviewAt: overdueNextReview,
        waitStartedAt: overdueWaitStart,
        vacationStartedAt,
        vacationEndedAt,
      });

      expect(byItemId.get(fixture.learningItemIds[0])?.nextReviewAt).toEqual(expectedPreVacation);
      expect(byItemId.get(fixture.learningItemIds[1])?.nextReviewAt).toEqual(expectedMidVacation);
      expect(byItemId.get(fixture.learningItemIds[2])?.nextReviewAt).toEqual(expectedOverdue);

      // The pre-vacation case is also spec 20's own worked example directly.
      expect(expectedPreVacation).toEqual(new Date(vacationEndedAt.getTime() + 3 * DAY_MS));
      // The mid-vacation case is spec 20's "4 hours after Vacation Mode ends" example.
      expect(expectedMidVacation).toEqual(new Date(vacationEndedAt.getTime() + 4 * HOUR_MS));
    });
  });

  it("leaves a Fluent item with no scheduled review (next_review_at IS NULL) untouched", async () => {
    await withTestTransaction(async (tx) => {
      const vacationStartedAt = new Date("2026-03-01T00:00:00Z");
      const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);
      const learnedAt = new Date(vacationStartedAt.getTime() - 100 * DAY_MS);

      const fixture = await seedProgressFixture(tx, [{ learnedAt, lastReviewedAt: learnedAt, nextReviewAt: null }]);

      await applyVacationSchedulingAdjustment(tx, fixture.userId, vacationStartedAt, vacationEndedAt);

      const [row] = await tx.select().from(userItemProgress).where(eq(userItemProgress.learningItemId, fixture.learningItemIds[0]));
      expect(row.nextReviewAt).toBeNull();
    });
  });
});
