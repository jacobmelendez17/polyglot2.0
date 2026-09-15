import { previousDateKey } from "@/lib/time/zoned-date";

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

/**
 * A manual streak adjustment's effect, anchored to the calendar date (in the
 * learner's timezone) it was set on — spec 20 Danger Zone's "current manual
 * streak adjustment". `setOnDate` is a `YYYY-MM-DD` key from
 * `lib/time/zoned-date.ts`'s `dateKeyInTimeZone`, matching the keys in
 * `calculateCurrentStreakLength`'s date sets.
 */
export type StreakAdjustmentAnchor = { value: number; setOnDate: string };

/**
 * Spec 20 Danger Zone — the authoritative current-streak-length
 * calculation ("Streak calculation must remain centralized in the
 * authoritative streak domain/read model. Do not calculate the final
 * streak independently in dashboard React components."). Distinct from
 * `buildStreak` above: that renders a fixed Monday-Sunday display row,
 * this walks backward from today counting the actual current unbroken
 * run — the number the spec's "Manually Set Streak"/"Streak Persistence"
 * sections describe.
 *
 * Combines exactly the three things "Streak Persistence" names — "actual
 * qualifying learning/review days + vacation-neutral periods + current
 * manual streak adjustment" — via one backward walk over calendar-date
 * keys (`YYYY-MM-DD`, already resolved to the learner's timezone by the
 * caller):
 *
 * - `today` not yet in `qualifyingDates` is treated as *pending*, not a
 *   miss, on the walk's first day only — a day that hasn't happened yet
 *   cannot break the streak, mirroring Vacation's own "do not break"
 *   framing applied to "not yet".
 * - A date in `vacationNeutralDates` never increments the count and never
 *   stops the walk ("do not increase streak, do not break streak").
 * - Reaching `manualAdjustment.setOnDate` (if given) with no break so far
 *   adds its `value` and stops immediately — the day it was set folds the
 *   value in whole, so the very next qualifying day is `value + 1`
 *   (spec's own worked example: set to 20, "next qualifying active day →
 *   21, following qualifying day → 22").
 * - Any other non-qualifying, non-neutral date stops the walk — a genuine
 *   break, discarding whatever the manual adjustment would have
 *   contributed beyond it (spec: "if the learner later genuinely breaks
 *   their streak → 0" — the days accumulated *after* the break still
 *   count, a fresh run starting from 0 at the break).
 *
 * Bounded to ~3 years of walking so an account with no adjustment and no
 * gap in its (hypothetically very long) history terminates rather than
 * looping forever; not reachable by any account this app has today.
 */
export function calculateCurrentStreakLength({
  today,
  qualifyingDates,
  vacationNeutralDates,
  manualAdjustment,
}: {
  today: string;
  qualifyingDates: Set<string>;
  vacationNeutralDates: Set<string>;
  manualAdjustment: StreakAdjustmentAnchor | null;
}): number {
  let count = 0;
  let cursor = today;

  for (let daysWalked = 0; daysWalked < 3 * 366; daysWalked++) {
    if (manualAdjustment && cursor === manualAdjustment.setOnDate) {
      count += manualAdjustment.value;
      break;
    }
    if (qualifyingDates.has(cursor)) {
      count += 1;
    } else if (vacationNeutralDates.has(cursor)) {
      // Neutral — neither counted nor a break.
    } else if (daysWalked === 0) {
      // Today, pending — hasn't happened yet, doesn't break.
    } else {
      break; // A genuine miss.
    }
    cursor = previousDateKey(cursor);
  }

  return count;
}
