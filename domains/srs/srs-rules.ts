import { getConfiguredInterval, intervalToMs, SRS_STAGE_ORDER } from "./srs-config";
import type { SrsIntervalMode } from "./review-preference";
import type { SrsInterval, SrsStage } from "./srs-types";

/** Position of a stage in the canonical order — never derive this from enum ordinal position elsewhere. */
export function getStageIndex(stage: SrsStage): number {
  return SRS_STAGE_ORDER.indexOf(stage);
}

/** Whether `stage` is at or beyond `threshold` in SRS progression (e.g. level-unlock's "at least Familiar 1" rule). */
export function isStageAtLeast(stage: SrsStage, threshold: SrsStage): boolean {
  return getStageIndex(stage) >= getStageIndex(threshold);
}

/** The next stage in progression, or the same stage if already Fluent (spec 08 §55's "Fluent has the configured terminal behavior"). */
export function getNextStage(stage: SrsStage): SrsStage {
  const index = getStageIndex(stage);
  const next = SRS_STAGE_ORDER[index + 1];
  return next ?? stage;
}

/**
 * Adds a calendar-month-valued interval using real calendar-month
 * arithmetic (spec 20 SRS Interval's "Duration Semantics": "September 12 +
 * 3 months = December 12," not "+ 90 days"). Uses `Date#setMonth`'s native
 * month-end rollover rather than an invented clamping rule the spec never
 * asks for — e.g. January 31 + 1 month lands on March 2 or 3 (February has
 * no 31st) — documented and covered by a test, not silently relied upon.
 */
function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function addInterval(date: Date, interval: SrsInterval): Date {
  const { unit, amount } = interval;
  if (unit === "months") return addCalendarMonths(date, amount);
  return new Date(date.getTime() + intervalToMs({ unit, amount }));
}

export type CalculateNextReviewInput = {
  stage: SrsStage;
  /** Curriculum level number — Levels 1-2 use the accelerated schedule. */
  level: number;
  /** Spec 20 SRS Interval — which of the five schedules to resolve `stage`'s interval from. */
  mode: SrsIntervalMode;
  /** Authoritative current time — never read from the browser or `new Date()` inside this function. */
  now: Date;
};

/**
 * Next scheduled review time for `stage` under `mode`, or `null` if the
 * stage has no further scheduled review (Fluent). Pure and deterministic —
 * the caller supplies `now` explicitly (spec 08 §34); this never calls
 * `new Date()` itself. Changing `mode` never recalculates a review that
 * already has a due time (spec 20's "Important Future-Only Rule") — that
 * guarantee falls out of this function only ever running once, at the
 * moment a review is scheduled, never retroactively against a stored
 * `next_review_at`.
 */
export function calculateNextReview({ stage, level, mode, now }: CalculateNextReviewInput): Date | null {
  const interval = getConfiguredInterval(stage, level, mode);
  if (!interval) return null;
  return addInterval(now, interval);
}

export type IsReviewDueInput = {
  nextReviewAt: Date | null;
  now: Date;
};

/** Due-review eligibility: strictly server-time-based, never the browser clock (architecture.md's SRS Architecture). */
export function isReviewDue({ nextReviewAt, now }: IsReviewDueInput): boolean {
  if (!nextReviewAt) return false;
  return now.getTime() >= nextReviewAt.getTime();
}
