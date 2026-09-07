import type { ForecastBucket, ReviewHistoryPoint, StreakDay } from "./dashboard-types";

/**
 * Pure bucketing helpers over real timestamps — the dashboard's forecast bar
 * graph, review-history line graph, and weekly streak (spec 13; project-overview.md's
 * "upcoming review forecast bar graph" / "review activity line graph").
 * Database-free by design: `dashboard-service.ts` fetches the raw rows,
 * these functions only do the time-bucketing math, so the bucket shapes
 * (8×3h, 7×1d, 10×3d) stay independently testable without a database.
 *
 * Bucket timing/labeling exactly matches the retired `dashboard-fixtures.ts`
 * (spec 06) — only the source of the counts changed, from hardcoded arrays
 * to real query results.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function hourLabel(date: Date): string {
  const hours = date.getHours();
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}${hours < 12 ? "a" : "p"}`;
}

export type ForecastSourceItem = {
  nextReviewAt: Date;
  itemType: "vocabulary" | "grammar";
};

function bucketForecast(now: Date, items: ForecastSourceItem[], bucketCount: number, bucketMs: number, label: (date: Date) => string): ForecastBucket[] {
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(now.getTime() + index * bucketMs);
    const bucketEnd = new Date(bucketStart.getTime() + bucketMs);
    const inBucket = items.filter((item) => item.nextReviewAt >= bucketStart && item.nextReviewAt < bucketEnd);
    return {
      timestamp: bucketStart.toISOString(),
      label: label(bucketStart),
      vocabularyCount: inBucket.filter((item) => item.itemType === "vocabulary").length,
      grammarCount: inBucket.filter((item) => item.itemType === "grammar").length,
    };
  });
}

/** `items` must already exclude anything due now or earlier — `dashboard-service.ts` sources this from `getUpcomingReviewForecast`, which enforces that at the query level. */
export function buildForecastBuckets(now: Date, items: ForecastSourceItem[]): { "24h": ForecastBucket[]; "7d": ForecastBucket[] } {
  return {
    "24h": bucketForecast(now, items, 8, 3 * HOUR_MS, hourLabel),
    "7d": bucketForecast(now, items, 7, DAY_MS, (date) => WEEKDAY_LABELS[date.getDay()]),
  };
}

function bucketReviewHistory(now: Date, timestamps: Date[], bucketCount: number, bucketMs: number, label: (date: Date) => string): ReviewHistoryPoint[] {
  return Array.from({ length: bucketCount }, (_, index) => {
    // History looks backward: the *last* bucket (index === bucketCount - 1)
    // is the most recent window, ending at `now` — the mirror image of
    // `bucketForecast`, whose first bucket starts at `now` and looks
    // forward. Getting this backwards would put future-looking ranges in a
    // "history" chart.
    const bucketEnd = new Date(now.getTime() - (bucketCount - 1 - index) * bucketMs);
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const completedCount = timestamps.filter((timestamp) => timestamp >= bucketStart && timestamp < bucketEnd).length;
    return { timestamp: bucketStart.toISOString(), label: label(bucketStart), completedCount };
  });
}

export function buildReviewHistoryBuckets(
  now: Date,
  timestamps: Date[],
): { "24h": ReviewHistoryPoint[]; "7d": ReviewHistoryPoint[]; "30d": ReviewHistoryPoint[] } {
  return {
    "24h": bucketReviewHistory(now, timestamps, 8, 3 * HOUR_MS, hourLabel),
    "7d": bucketReviewHistory(now, timestamps, 7, DAY_MS, (date) => WEEKDAY_LABELS[date.getDay()]),
    "30d": bucketReviewHistory(now, timestamps, 10, 3 * DAY_MS, (date) => `${date.getMonth() + 1}/${date.getDate()}`),
  };
}

/**
 * Monday-through-Sunday of the current calendar week, `isActive` when any
 * review completed that day. Lesson-only days (no review yet — a freshly
 * enrolled item isn't due for hours) are not counted active: `review_events`
 * is the only per-day activity signal that exists anywhere in the schema
 * today. Recorded as a scoping assumption in progress-tracker.md, not
 * invented silently.
 */
export function buildStreak(now: Date, reviewTimestamps: Date[]): StreakDay[] {
  const activeDates = new Set(reviewTimestamps.map((timestamp) => timestamp.toISOString().slice(0, 10)));
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0 = Monday
  const monday = new Date(now.getTime() - dayOfWeek * DAY_MS);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getTime() + index * DAY_MS);
    const dateKey = date.toISOString().slice(0, 10);
    const daysAgo = Math.round((now.getTime() - date.getTime()) / DAY_MS);
    return {
      date: dateKey,
      label: WEEKDAY_LABELS[date.getDay()],
      isActive: activeDates.has(dateKey),
      isToday: daysAgo === 0,
    };
  });
}
