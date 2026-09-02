/**
 * Explicit SRS stage identifiers (spec 08 §8, §33). Business logic must
 * never infer progression from PostgreSQL enum ordinal position or array
 * index — `SRS_STAGE_ORDER` in `srs-config.ts` is the one authoritative
 * ordering.
 */
export type SrsStage =
  | "beginner_1"
  | "beginner_2"
  | "beginner_3"
  | "beginner_4"
  | "familiar_1"
  | "familiar_2"
  | "intermediate"
  | "master"
  | "fluent";

export type IntervalUnit = "hours" | "days" | "weeks" | "months";

export type SrsInterval = { unit: IntervalUnit; amount: number };
