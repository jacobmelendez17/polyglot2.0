import { getConfiguredInterval, intervalToMs, SRS_STAGE_ORDER } from "./srs-config";
import type { SrsStage } from "./srs-types";

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

export type CalculateNextReviewInput = {
  stage: SrsStage;
  /** Curriculum level number — Levels 1-2 use the accelerated schedule. */
  level: number;
  /** Authoritative current time — never read from the browser or `new Date()` inside this function. */
  now: Date;
};

/**
 * Next scheduled review time for `stage`, or `null` if the stage has no
 * further scheduled review (Fluent). Pure and deterministic — the caller
 * supplies `now` explicitly (spec 08 §34); this never calls `new Date()`
 * itself.
 */
export function calculateNextReview({ stage, level, now }: CalculateNextReviewInput): Date | null {
  const interval = getConfiguredInterval(stage, level);
  if (!interval) return null;
  return new Date(now.getTime() + intervalToMs(interval));
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
