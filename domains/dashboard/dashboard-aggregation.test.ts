import { describe, expect, it } from "vitest";

import { buildForecastBuckets, buildReviewHistoryBuckets, buildStreak } from "./dashboard-aggregation";
import type { ForecastSourceItem } from "./dashboard-aggregation";

const NOW = new Date("2026-08-30T12:00:00.000Z"); // a Sunday

describe("buildForecastBuckets", () => {
  it("sorts items into the correct 3-hour bucket, split by item type", () => {
    const items: ForecastSourceItem[] = [
      { nextReviewAt: new Date("2026-08-30T13:00:00.000Z"), itemType: "vocabulary" }, // bucket 0 (12p-3p)
      { nextReviewAt: new Date("2026-08-30T14:30:00.000Z"), itemType: "grammar" }, // bucket 0
      { nextReviewAt: new Date("2026-08-30T16:00:00.000Z"), itemType: "vocabulary" }, // bucket 1 (3p-6p)
    ];

    const { "24h": buckets } = buildForecastBuckets(NOW, items);

    expect(buckets).toHaveLength(8);
    expect(buckets[0]).toMatchObject({ vocabularyCount: 1, grammarCount: 1 });
    expect(buckets[1]).toMatchObject({ vocabularyCount: 1, grammarCount: 0 });
    expect(buckets.slice(2).every((bucket) => bucket.vocabularyCount === 0 && bucket.grammarCount === 0)).toBe(true);
  });

  it("excludes items outside the 7-day window and produces 7 daily buckets", () => {
    const items: ForecastSourceItem[] = [
      { nextReviewAt: new Date("2026-08-31T12:00:00.000Z"), itemType: "vocabulary" }, // +1 day
      { nextReviewAt: new Date("2026-09-10T12:00:00.000Z"), itemType: "grammar" }, // far outside 7d
    ];

    const { "7d": buckets } = buildForecastBuckets(NOW, items);

    expect(buckets).toHaveLength(7);
    expect(buckets[1].vocabularyCount).toBe(1);
    expect(buckets.reduce((sum, bucket) => sum + bucket.grammarCount, 0)).toBe(0);
  });

  it("returns all-zero buckets for no upcoming items, never an empty array", () => {
    const { "24h": buckets24h, "7d": buckets7d } = buildForecastBuckets(NOW, []);
    expect(buckets24h).toHaveLength(8);
    expect(buckets7d).toHaveLength(7);
    expect(buckets24h.every((bucket) => bucket.vocabularyCount === 0 && bucket.grammarCount === 0)).toBe(true);
  });
});

describe("buildReviewHistoryBuckets", () => {
  it("counts past completions into the correct bucket for each range, most recent bucket last", () => {
    const timestamps = [
      new Date("2026-08-30T11:00:00.000Z"), // 1h ago -> last 24h bucket
      new Date("2026-08-29T00:00:00.000Z"), // 1.5 days ago -> second-to-last 7d bucket
      new Date("2026-08-01T12:00:00.000Z"), // ~29 days ago -> within 30d window
    ];

    const { "24h": h24, "7d": h7d, "30d": h30d } = buildReviewHistoryBuckets(NOW, timestamps);

    expect(h24).toHaveLength(8);
    expect(h24.at(-1)?.completedCount).toBe(1);
    expect(h7d).toHaveLength(7);
    expect(h7d.at(-2)?.completedCount).toBe(1);
    expect(h30d).toHaveLength(10);
    expect(h30d.reduce((sum, point) => sum + point.completedCount, 0)).toBe(3);
  });

  it("returns all-zero points for no history", () => {
    const { "24h": h24 } = buildReviewHistoryBuckets(NOW, []);
    expect(h24.every((point) => point.completedCount === 0)).toBe(true);
  });
});

describe("buildStreak", () => {
  it("marks Monday through Sunday of the current week, active only on days with a completion", () => {
    const timestamps = [
      new Date("2026-08-24T09:00:00.000Z"), // Monday
      new Date("2026-08-27T20:00:00.000Z"), // Thursday
    ];

    const streak = buildStreak(NOW, timestamps);

    expect(streak).toHaveLength(7);
    expect(streak.map((day) => day.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(streak[0]).toMatchObject({ date: "2026-08-24", isActive: true });
    expect(streak[1]).toMatchObject({ isActive: false });
    expect(streak[3]).toMatchObject({ date: "2026-08-27", isActive: true });
    expect(streak.at(-1)).toMatchObject({ date: "2026-08-30", isToday: true });
    expect(streak.filter((day) => day.isToday)).toHaveLength(1);
  });

  it("marks every day inactive when there is no history", () => {
    const streak = buildStreak(NOW, []);
    expect(streak.every((day) => !day.isActive)).toBe(true);
  });
});
