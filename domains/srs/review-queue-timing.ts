import { startOfDayInTimeZone } from "@/lib/time/zoned-date";

import type { ReviewQueueTimingMode } from "./review-preference";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Spec 20 Review Queue Timing — Start of Hour: round the calculated due
 * timestamp forward to the next hour boundary, or leave it alone if it's
 * already exactly on one. An hour boundary is the same absolute instant
 * everywhere (only Start of Day's calendar-date alignment needs a
 * timezone), so this needs none.
 */
function roundUpToHour(date: Date): Date {
  const remainder = date.getTime() % MS_PER_HOUR;
  return remainder === 0
    ? date
    : new Date(date.getTime() + (MS_PER_HOUR - remainder));
}

/**
 * The last step of the SRS scheduling pipeline (spec 20's own diagram:
 * "raw due time -> Review Queue Timing -> nextReviewAt"). Applied to every
 * freshly-computed due time — whether the completion just advanced or was
 * penalized, `srs-rules.ts`'s `calculateNextReview` output either way — and
 * never to an already-persisted `nextReviewAt`, which keeps this future-only
 * the same way SRS Interval mode changes already are.
 */
export function applyReviewQueueTiming(
  dueTime: Date,
  mode: ReviewQueueTimingMode,
  timeZone: string,
): Date {
  return mode === "start_of_day"
    ? startOfDayInTimeZone(dueTime, timeZone)
    : roundUpToHour(dueTime);
}
