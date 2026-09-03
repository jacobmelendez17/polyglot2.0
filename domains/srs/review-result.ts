import {
  BEGINNER_PENALTY_STAGES,
  FAMILIAR_PLUS_PENALTY_FACTOR,
  isBeginnerTier,
  MAX_INCORRECT_ADJUSTMENT_COUNT_PER_ITEM,
  MINIMUM_REVIEW_STAGE,
} from "./review-config";
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
   * a count, per `MAX_INCORRECT_ADJUSTMENT_COUNT_PER_ITEM`.
   */
  hadIncorrectRequiredAnswer: boolean;
};

export type ReviewStageResult = {
  stage: SrsStage;
  result: ReviewResultCategory;
  /** True only when this result is what first brings the item to Fluent. */
  reachedFluent: boolean;
};

/**
 * The one authoritative SRS stage transition for a fully completed review
 * item (spec 09 §9). Pure — the caller supplies `stage` and whether any
 * required question was ever wrong; scheduling the next review from the
 * resulting stage is `calculateNextReview`'s job, not this function's.
 */
export function calculateReviewStageResult({
  stage,
  hadIncorrectRequiredAnswer,
}: CalculateReviewStageResultInput): ReviewStageResult {
  if (!hadIncorrectRequiredAnswer) {
    const nextStage = getNextStage(stage);
    return { stage: nextStage, result: "advanced", reachedFluent: nextStage === "fluent" };
  }

  return { stage: applyReviewPenalty(stage), result: "penalized", reachedFluent: false };
}

function applyReviewPenalty(stage: SrsStage): SrsStage {
  const penaltyStages = isBeginnerTier(stage)
    ? BEGINNER_PENALTY_STAGES
    : MAX_INCORRECT_ADJUSTMENT_COUNT_PER_ITEM * FAMILIAR_PLUS_PENALTY_FACTOR;

  const minimumIndex = getStageIndex(MINIMUM_REVIEW_STAGE);
  const newIndex = Math.max(minimumIndex, getStageIndex(stage) - penaltyStages);
  return SRS_STAGE_ORDER[newIndex];
}
