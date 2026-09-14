import { FLUENT_MAINTENANCE_INTERVAL_MONTHS, getConfiguredInterval, intervalToMs, SRS_STAGE_ORDER } from "./srs-config";
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

/**
 * Spec 20 Fluent Mode — "next review in 6 calendar months" from `anchor`.
 * Reuses the same calendar-month arithmetic as SRS Interval's Master stage;
 * entirely bypasses the normal SRS Interval / Review Queue Timing pipeline
 * (`review-completion.ts` calls this instead of `calculateNextReview`
 * whenever a completion lands on Fluent with Fluent Mode enabled), not
 * layered on top of it.
 *
 * Two different callers, two different anchors — both correct for their own
 * rule, so this function stays agnostic about which one applies:
 * - The live maintenance loop ("Fluent Mode On": every completed Fluent
 *   review schedules another one 6 months out) passes that review's own
 *   `now`, exactly like any other stage's interval is computed from `now`.
 * - `domains/progress/repository.ts`'s `reconcileFluentSchedules` — the
 *   *toggle*-driven backfill for items that have been sitting terminal —
 *   passes the item's own `fluentAt` instead, per spec 20's explicit
 *   "Existing Fluent Items" contrast: "Use fluentAt + 6 calendar months. Do
 *   not use settingChangedAt + 6 months." Passing `now` there would be
 *   exactly the mistake that sentence rules out.
 */
export function calculateFluentMaintenanceReview(anchor: Date): Date {
  return addCalendarMonths(anchor, FLUENT_MAINTENANCE_INTERVAL_MONTHS);
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
