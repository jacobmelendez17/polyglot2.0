import { MINIMUM_REVIEW_STAGE } from "./review-config";
import type { SrsStrictness } from "./review-preference";
import { getStageIndex, getNextStage } from "./srs-rules";
import { SRS_STAGE_ORDER } from "./srs-config";
import type { SrsStage } from "./srs-types";

/** A small stable domain value for review-event persistence (spec 09 §14). */
export type ReviewResultCategory = "advanced" | "penalized";

export type CalculateReviewStageResultInput = {
  stage: SrsStage;
  /**
   * Whether any of the item's required directions/types were answered
   * incorrectly at any point during this review (spec 09 §9). Retries of the
   * same direction do not increase this beyond "any" — it is a boolean, not
   * a count: every SRS Strictness level applies its demotion at most once
   * per completed item, regardless of how many distinct required
   * directions/types were wrong.
   */
  hadIncorrectRequiredAnswer: boolean;
  /**
   * Spec 20 SRS Strictness — which demotion rule applies when
   * `hadIncorrectRequiredAnswer` is true. Grammar and Vocabulary are
   * configured independently; the caller resolves which one applies to
   * this specific item (by its content type) before calling here — this
   * function itself has no notion of item type.
   */
  srsStrictness: SrsStrictness;
};

export type ReviewStageResult = {
  stage: SrsStage;
  result: ReviewResultCategory;
  /** True only when this result is what first brings the item to Fluent. */
  reachedFluent: boolean;
};

/**
 * The one authoritative SRS stage transition for a fully completed review
 * item (spec 09 §9, spec 20 SRS Strictness). Pure — the caller supplies
 * `stage`, whether any required question was ever wrong, and which
 * strictness level applies; scheduling the next review from the resulting
 * stage is `calculateNextReview`'s job, not this function's.
 *
 * SRS Strictness changes incorrect-review demotion only (spec 20's own
 * "Correct Reviews" section) — a correct completion always advances exactly
 * one stage via `getNextStage`, regardless of strictness.
 */
export function calculateReviewStageResult({
  stage,
  hadIncorrectRequiredAnswer,
  srsStrictness,
}: CalculateReviewStageResultInput): ReviewStageResult {
  if (!hadIncorrectRequiredAnswer) {
    const nextStage = getNextStage(stage);
    // "First brings the item to Fluent" — not still true on every later
    // Fluent-maintenance correct review, which also resolves `nextStage` to
    // "fluent" (`getNextStage` clamps at the end of `SRS_STAGE_ORDER`).
    // Spec 20 Fluent Mode's own maintenance loop is what first makes this
    // distinction observable in practice (Fluent was hard-terminal before
    // it existed, so a correct review at Fluent could never occur).
    return {
      stage: nextStage,
      result: "advanced",
      reachedFluent: nextStage === "fluent" && stage !== "fluent",
    };
  }

  return {
    stage: applyReviewPenalty(stage, srsStrictness),
    result: "penalized",
    reachedFluent: false,
  };
}

const STAGES_BACK: Record<"one_stage" | "two_stages" | "three_stages", number> =
  {
    one_stage: 1,
    two_stages: 2,
    three_stages: 3,
  };

/**
 * Spec 20 SRS Strictness's five demotion rules. Replaces the old WaniKani-
 * inspired Beginner-1/Familiar+-2 split outright, per the spec's explicit
 * "must no longer exist as the default... do not leave the old 2-stage
 * Familiar+ logic reachable through another code path" — there is no tier
 * check anywhere in this function; every stage is treated identically,
 * and which rule applies is entirely the learner's own SRS Strictness
 * choice (default "1 Stage", the new Polyglot-wide default).
 */
function applyReviewPenalty(
  stage: SrsStage,
  srsStrictness: SrsStrictness,
): SrsStage {
  const minimumIndex = getStageIndex(MINIMUM_REVIEW_STAGE);

  // "Full: Reset the item to Beginner 1. Do not create Beginner 0" — a
  // direct reset, not an index computation, so it can never be affected by
  // an off-by-one in the arithmetic below.
  if (srsStrictness === "full") return MINIMUM_REVIEW_STAGE;

  const currentIndex = getStageIndex(stage);

  if (srsStrictness === "half") {
    // Spec's own worked examples are 1-indexed stage *positions*
    // ("Master = stage position 8"): floor(position / 2), then clamp.
    const currentPosition = currentIndex + 1;
    const newPosition = Math.floor(currentPosition / 2);
    return SRS_STAGE_ORDER[Math.max(minimumIndex, newPosition - 1)];
  }

  return SRS_STAGE_ORDER[
    Math.max(minimumIndex, currentIndex - STAGES_BACK[srsStrictness])
  ];
}
