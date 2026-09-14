import type { SrsIntervalMode } from "./review-preference";
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

/** Human-readable stage labels — the one shared mapping, so every display of an `SrsStage` (Sandbox controls, a future reviews/progress view) reads identically. */
export const SRS_STAGE_LABELS: Record<SrsStage, string> = {
  beginner_1: "Beginner 1",
  beginner_2: "Beginner 2",
  beginner_3: "Beginner 3",
  beginner_4: "Beginner 4",
  familiar_1: "Familiar 1",
  familiar_2: "Familiar 2",
  intermediate: "Intermediate",
  master: "Master",
  fluent: "Fluent",
};

/**
 * Spec 20 SRS Interval — Level 3+ Standard Intervals, one full table per
 * mode, transcribed directly from the spec's own table rather than derived
 * from a "base + delta" computation, so each cell can be checked against
 * the spec by eye. Beginner 1/2/4 are identical across every mode (the
 * spec's own "these remain fixed" list) — repeated per table anyway, for
 * the same reason: a reader should never have to cross-reference a second
 * structure to know what Beginner 2 resolves to under "Longest".
 *
 * `default`'s Master value (3 months, not 4) is spec 20's own explicit,
 * deliberate change from the pre-spec-20 default — see this file's git
 * history/progress-tracker.md for the "do not leave the old four-month
 * Master interval functioning as an undocumented alternate default"
 * instruction this satisfies. `shorter` and `default` both resolve Master
 * to 3 months — a real quirk in the spec's own table, not a transcription
 * error (its "Default Schedule Change" section restates "Master → Fluent:
 * 3 calendar months" separately, consistent with this table).
 *
 * Month-valued cells (`master` only — `intermediate` is duration-based
 * weeks under every mode, not calendar months, a real behavior change from
 * the pre-spec-20 config) are resolved via real calendar-month arithmetic
 * by `srs-rules.ts`'s `calculateNextReview`, never approximated as a fixed
 * number of days — spec 20's own "Duration Semantics": "September 12 + 3
 * months = December 12, not September 12 + 90 days."
 */
const STANDARD_INTERVALS_BY_MODE: Record<SrsIntervalMode, Record<SrsStage, SrsInterval | null>> = {
  shortest: {
    beginner_1: { unit: "hours", amount: 4 },
    beginner_2: { unit: "hours", amount: 8 },
    beginner_3: { unit: "hours", amount: 12 },
    beginner_4: { unit: "days", amount: 2 },
    familiar_1: { unit: "days", amount: 5 },
    familiar_2: { unit: "weeks", amount: 1 },
    intermediate: { unit: "weeks", amount: 2 },
    master: { unit: "months", amount: 2 },
    fluent: null,
  },
  shorter: {
    beginner_1: { unit: "hours", amount: 4 },
    beginner_2: { unit: "hours", amount: 8 },
    beginner_3: { unit: "hours", amount: 18 },
    beginner_4: { unit: "days", amount: 2 },
    familiar_1: { unit: "days", amount: 6 },
    familiar_2: { unit: "weeks", amount: 1.5 },
    intermediate: { unit: "weeks", amount: 3 },
    master: { unit: "months", amount: 3 },
    fluent: null,
  },
  default: {
    beginner_1: { unit: "hours", amount: 4 },
    beginner_2: { unit: "hours", amount: 8 },
    beginner_3: { unit: "hours", amount: 24 },
    beginner_4: { unit: "days", amount: 2 },
    familiar_1: { unit: "days", amount: 7 },
    familiar_2: { unit: "weeks", amount: 2 },
    intermediate: { unit: "weeks", amount: 4 },
    master: { unit: "months", amount: 3 },
    fluent: null,
  },
  longer: {
    beginner_1: { unit: "hours", amount: 4 },
    beginner_2: { unit: "hours", amount: 8 },
    beginner_3: { unit: "hours", amount: 30 },
    beginner_4: { unit: "days", amount: 2 },
    familiar_1: { unit: "days", amount: 8 },
    familiar_2: { unit: "weeks", amount: 2.5 },
    intermediate: { unit: "weeks", amount: 5 },
    master: { unit: "months", amount: 5 },
    fluent: null,
  },
  longest: {
    beginner_1: { unit: "hours", amount: 4 },
    beginner_2: { unit: "hours", amount: 8 },
    beginner_3: { unit: "hours", amount: 36 },
    beginner_4: { unit: "days", amount: 2 },
    familiar_1: { unit: "days", amount: 9 },
    familiar_2: { unit: "weeks", amount: 3 },
    intermediate: { unit: "weeks", amount: 6 },
    master: { unit: "months", amount: 6 },
    fluent: null,
  },
};

/**
 * Accelerated Early-Level Intervals — project-overview.md, spec 20's own
 * "Level 1-2 Acceleration" section ("Keep the current accelerated
 * early-Level schedule... these accelerated early intervals do not change
 * based on [SRS Interval mode]"). Applies only to curriculum Levels 1 and
 * 2, and only overrides the Beginner stages; Familiar 1 onward always
 * follows the mode-selected standard schedule regardless of level.
 */
const ACCELERATED_BEGINNER_INTERVALS: Partial<Record<SrsStage, SrsInterval>> = {
  beginner_1: { unit: "hours", amount: 2 },
  beginner_2: { unit: "hours", amount: 4 },
  beginner_3: { unit: "hours", amount: 8 },
  beginner_4: { unit: "days", amount: 1 },
};

const ACCELERATED_LEVELS = new Set([1, 2]);

/** Spec 20 Fluent Mode — "next review in 6 calendar months," independent of SRS Interval mode. See `srs-rules.ts`'s `calculateFluentMaintenanceReview`. */
export const FLUENT_MAINTENANCE_INTERVAL_MONTHS = 6;

const MS_PER_UNIT: Record<Exclude<IntervalUnit, "months">, number> = {
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Resolves the configured interval for a stage under the given SRS Interval
 * mode, applying the Level 1-2 acceleration where it exists (mode-invariant
 * — see `ACCELERATED_BEGINNER_INTERVALS`'s docstring). `null` means terminal
 * (no further review).
 */
export function getConfiguredInterval(stage: SrsStage, level: number, mode: SrsIntervalMode): SrsInterval | null {
  if (ACCELERATED_LEVELS.has(level)) {
    const accelerated = ACCELERATED_BEGINNER_INTERVALS[stage];
    if (accelerated) return accelerated;
  }
  return STANDARD_INTERVALS_BY_MODE[mode][stage];
}

/**
 * Duration-based interval → milliseconds (spec 20's "Duration Semantics":
 * "1 day = 24 hours... 1.5 weeks = 10 days 12 hours" — a fixed linear
 * offset, unlike months). Never called with a `"months"` interval — those
 * go through `addCalendarMonths` instead (`srs-rules.ts`'s
 * `calculateNextReview`), since a month has no fixed duration.
 */
export function intervalToMs(interval: SrsInterval & { unit: Exclude<IntervalUnit, "months"> }): number {
  return interval.amount * MS_PER_UNIT[interval.unit];
}
