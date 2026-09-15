import { describe, expect, it } from "vitest";

import { userStreakAdjustments } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { insertReviewEvent } from "@/domains/srs/review-repository";
import { endVacationPeriod, startVacationPeriod } from "@/domains/users/vacation-repository";

import { getLatestStreakAdjustment } from "./streak-repository";
import { getCurrentStreak, setManualStreak } from "./streak-service";

type Tx = Parameters<typeof insertReviewEvent>[0];

async function recordReview(tx: Tx, userId: string, languageId: string, learningItemId: string, reviewedAt: Date) {
  await insertReviewEvent(tx, {
    userId,
    languageId,
    learningItemId,
    reviewedAt,
    stageBefore: "beginner_1",
    stageAfter: "beginner_2",
    requiredQuestionCount: 1,
    incorrectAdjustmentCount: 0,
    result: "advanced",
  });
}

describe("setManualStreak (spec 20 Danger Zone)", () => {
  it("stores a new streak adjustment row, never a fake review event", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const now = new Date("2026-08-24T12:00:00Z");

      const result = await setManualStreak(tx, { userId: learnerId, value: 20, idempotencyKey: crypto.randomUUID(), now });

      expect(result.value).toBe(20);
      const latest = await getLatestStreakAdjustment(tx, learnerId);
      expect(latest?.value).toBe(20);
      expect(latest?.createdAt).toEqual(now);
    });
  });

  it("is idempotent — retrying with the same key does not insert a second row", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();
      const now = new Date("2026-08-24T12:00:00Z");

      await setManualStreak(tx, { userId: learnerId, value: 20, idempotencyKey, now });
      await setManualStreak(tx, { userId: learnerId, value: 20, idempotencyKey, now });

      const rows = await tx.select().from(userStreakAdjustments);
      expect(rows.filter((row) => row.userId === learnerId)).toHaveLength(1);
    });
  });
});

describe("getCurrentStreak (spec 20 Danger Zone) — full composition against real review_events/vacation data", () => {
  it("counts consecutive real review days ending today, timezone UTC by fixture default", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId, aguaId } = await seedTestFixtures(tx);
      // "now" (the query instant) is later in the day than the review it's meant to still count —
      // getReviewTimestampsInWindow's `until` bound is exclusive, matching every other window query
      // in this codebase, so a review recorded at the exact query instant would not be its own day's activity.
      await recordReview(tx, learnerId, languageId, gatoId, new Date("2026-08-28T10:00:00Z"));
      await recordReview(tx, learnerId, languageId, casaId, new Date("2026-08-29T10:00:00Z"));
      await recordReview(tx, learnerId, languageId, aguaId, new Date("2026-08-30T10:00:00Z")); // Sunday
      const now = new Date("2026-08-30T12:00:00Z");

      const streak = await getCurrentStreak(tx, { userId: learnerId, languageId, now });
      expect(streak).toBe(3);
    });
  });

  it("reflects the spec's own worked example end-to-end: manual streak, then real activity grows it", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const monday = new Date("2026-08-24T08:00:00Z");
      const tuesdayReview = new Date("2026-08-25T08:00:00Z");
      const tuesdayQuery = new Date("2026-08-25T10:00:00Z");

      await setManualStreak(tx, { userId: learnerId, value: 20, idempotencyKey: crypto.randomUUID(), now: monday });
      const onMonday = await getCurrentStreak(tx, { userId: learnerId, languageId, now: new Date("2026-08-24T10:00:00Z") });
      expect(onMonday).toBe(20);

      await recordReview(tx, learnerId, languageId, gatoId, tuesdayReview);
      const onTuesday = await getCurrentStreak(tx, { userId: learnerId, languageId, now: tuesdayQuery });
      expect(onTuesday).toBe(21);
    });
  });

  it("vacation days remain neutral in the real, composed calculation", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      await recordReview(tx, learnerId, languageId, gatoId, new Date("2026-08-24T08:00:00Z")); // Monday
      await startVacationPeriod(tx, learnerId, new Date("2026-08-25T00:00:00Z")); // Tue-Fri vacation
      await endVacationPeriod(tx, learnerId, new Date("2026-08-29T00:00:00Z"));
      await recordReview(tx, learnerId, languageId, casaId, new Date("2026-08-29T08:00:00Z")); // Saturday
      const now = new Date("2026-08-29T10:00:00Z");

      const streak = await getCurrentStreak(tx, { userId: learnerId, languageId, now });
      expect(streak).toBe(2);
    });
  });

  it("a genuine break after a manual set discards its value in the real, composed calculation", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const monday = new Date("2026-08-24T08:00:00Z");
      const wednesdayReview = new Date("2026-08-26T08:00:00Z");
      const wednesdayQuery = new Date("2026-08-26T10:00:00Z");

      await setManualStreak(tx, { userId: learnerId, value: 20, idempotencyKey: crypto.randomUUID(), now: monday });
      // Tuesday (8-25) has no activity and is not a vacation day — a genuine miss.
      await recordReview(tx, learnerId, languageId, gatoId, wednesdayReview);

      const streak = await getCurrentStreak(tx, { userId: learnerId, languageId, now: wednesdayQuery });
      expect(streak).toBe(1);
    });
  });

  it("returns 0 for a learner with no review history, no vacation, and no manual adjustment", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, developerId } = await seedTestFixtures(tx);
      const streak = await getCurrentStreak(tx, { userId: developerId, languageId, now: new Date("2026-08-30T12:00:00Z") });
      expect(streak).toBe(0);
    });
  });
});
