import { describe, expect, it } from "vitest";

import { buildForecastBuckets, buildReviewHistoryBuckets, buildStreak, calculateCurrentStreakLength } from "./dashboard-aggregation";
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

describe("calculateCurrentStreakLength", () => {
  it("counts consecutive qualifying days ending today", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-30",
      qualifyingDates: new Set(["2026-08-28", "2026-08-29", "2026-08-30"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: null,
    });
    expect(streak).toBe(3);
  });

  it("does not break the streak when today has no activity yet — it's pending, not a miss", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-30",
      qualifyingDates: new Set(["2026-08-28", "2026-08-29"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: null,
    });
    expect(streak).toBe(2);
  });

  it("stops at the first genuine miss before today", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-30",
      // 8-26 is a miss between 8-25 and 8-27/8-28/8-29 — only the unbroken run ending today counts.
      qualifyingDates: new Set(["2026-08-25", "2026-08-27", "2026-08-28", "2026-08-29"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: null,
    });
    expect(streak).toBe(3);
  });

  it("returns 0 when today is pending and yesterday was already a miss", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-30",
      qualifyingDates: new Set(["2026-08-27"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: null,
    });
    expect(streak).toBe(0);
  });

  it("spec's own vacation worked example: Mon/Tue active, Wed-Fri vacation, Sat active — the streak continues across the vacation", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-29", // Saturday
      qualifyingDates: new Set(["2026-08-24", "2026-08-25", "2026-08-29"]), // Mon, Tue, Sat
      vacationNeutralDates: new Set(["2026-08-26", "2026-08-27", "2026-08-28"]), // Wed, Thu, Fri
      manualAdjustment: null,
    });
    expect(streak).toBe(3);
  });

  it("vacation days never increment the count, even with no other activity", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-28",
      qualifyingDates: new Set(),
      vacationNeutralDates: new Set(["2026-08-26", "2026-08-27", "2026-08-28"]),
      manualAdjustment: null,
    });
    expect(streak).toBe(0);
  });

  it("spec's own worked example: manual streak set to 20, the day it's set", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-24",
      qualifyingDates: new Set(),
      vacationNeutralDates: new Set(),
      manualAdjustment: { value: 20, setOnDate: "2026-08-24" },
    });
    expect(streak).toBe(20);
  });

  it("spec's own worked example: the next qualifying day after a manual set is value + 1", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-25",
      qualifyingDates: new Set(["2026-08-25"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: { value: 20, setOnDate: "2026-08-24" },
    });
    expect(streak).toBe(21);
  });

  it("spec's own worked example: the following qualifying day is value + 2", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-26",
      qualifyingDates: new Set(["2026-08-25", "2026-08-26"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: { value: 20, setOnDate: "2026-08-24" },
    });
    expect(streak).toBe(22);
  });

  it("a genuine break after the manual set discards its value — a fresh run starts from 0", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-26", // Wednesday
      // Set 20 on Monday (8-24); Tuesday (8-25) is a genuine miss; Wednesday (8-26) is fresh.
      qualifyingDates: new Set(["2026-08-26"]),
      vacationNeutralDates: new Set(),
      manualAdjustment: { value: 20, setOnDate: "2026-08-24" },
    });
    expect(streak).toBe(1);
  });

  it("mid-pending-day, an unbroken manual streak still reads at its set value", () => {
    const streak = calculateCurrentStreakLength({
      today: "2026-08-25", // Tuesday, nothing done yet today
      qualifyingDates: new Set(),
      vacationNeutralDates: new Set(),
      manualAdjustment: { value: 20, setOnDate: "2026-08-24" },
    });
    expect(streak).toBe(20);
  });
});
