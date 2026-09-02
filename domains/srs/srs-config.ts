import type { IntervalUnit, SrsInterval, SrsStage } from "./srs-types";

/**
 * The one authoritative stage ordering (spec 08 §33). Everything that needs
 * to compare stage progression — level-unlock thresholds, future review
 * advancement — goes through this array, never enum ordinal position.
 */
export const SRS_STAGE_ORDER: readonly SrsStage[] = [
  "beginner_1",
  "beginner_2",
  "beginner_3",
  "beginner_4",
  "familiar_1",
  "familiar_2",
  "intermediate",
  "master",
  "fluent",
] as const;

/** Standard Review Intervals — project-overview.md. `null` means terminal: Fluent has no further scheduled review. */
const STANDARD_INTERVALS: Record<SrsStage, SrsInterval | null> = {
  beginner_1: { unit: "hours", amount: 4 },
  beginner_2: { unit: "hours", amount: 8 },
  beginner_3: { unit: "days", amount: 1 },
  beginner_4: { unit: "days", amount: 2 },
  familiar_1: { unit: "weeks", amount: 1 },
  familiar_2: { unit: "weeks", amount: 2 },
  intermediate: { unit: "months", amount: 1 },
  master: { unit: "months", amount: 4 },
  fluent: null,
};

/**
 * Accelerated Early-Level Intervals — project-overview.md. Applies only to
 * curriculum Levels 1 and 2, and only overrides the Beginner stages; Familiar
 * 1 onward always follows the standard schedule regardless of level.
 */
const ACCELERATED_BEGINNER_INTERVALS: Partial<Record<SrsStage, SrsInterval>> = {
  beginner_1: { unit: "hours", amount: 2 },
  beginner_2: { unit: "hours", amount: 4 },
  beginner_3: { unit: "hours", amount: 8 },
  beginner_4: { unit: "days", amount: 1 },
};

const ACCELERATED_LEVELS = new Set([1, 2]);

const MS_PER_UNIT: Record<IntervalUnit, number> = {
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  // Calendar months vary; the product's interval config is expressed in
  // approximate 30-day months, consistent with how the marketing copy
  // (components/marketing/srs-section.tsx) already describes them.
  months: 30 * 24 * 60 * 60 * 1000,
};

/** Resolves the configured interval for a stage, applying the Level 1-2 acceleration where it exists. `null` means terminal (no further review). */
export function getConfiguredInterval(stage: SrsStage, level: number): SrsInterval | null {
  if (ACCELERATED_LEVELS.has(level)) {
    const accelerated = ACCELERATED_BEGINNER_INTERVALS[stage];
    if (accelerated) return accelerated;
  }
  return STANDARD_INTERVALS[stage];
}

export function intervalToMs(interval: SrsInterval): number {
  return interval.amount * MS_PER_UNIT[interval.unit];
}
