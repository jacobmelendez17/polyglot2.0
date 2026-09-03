import { calculateReviewStageResult } from "./review-result";
import { calculateNextReview } from "./srs-rules";
import type { ReviewItemCompletionPreview } from "./review-types";
import type { SrsStage } from "./srs-types";

export type BuildReviewItemCompletionPreviewInput = {
  itemId: string;
  stageBefore: SrsStage;
  levelNumber: number;
  hadIncorrectRequiredAnswer: boolean;
  now: Date;
};

/**
 * A pure, unpersisted preview of the SRS mutation a just-completed review
 * item would receive — spec 09 unit 3's explicit scope boundary ("No
 * authoritative SRS mutation until the completion boundary is reached").
 * Composes the two already-built pure `domains/srs` primitives
 * (`calculateReviewStageResult`, `calculateNextReview`); nothing here reads
 * or writes the database. Unit 4 replaces the call site that currently
 * calls this with the real atomic transaction (lock/reload progress, insert
 * `review_events`, etc.) — mirrors spec 07's `lesson-completion-preview.ts`
 * relationship to its later unit 6 exactly (see progress-tracker.md).
 */
export function buildReviewItemCompletionPreview({
  itemId,
  stageBefore,
  levelNumber,
  hadIncorrectRequiredAnswer,
  now,
}: BuildReviewItemCompletionPreviewInput): ReviewItemCompletionPreview {
  const { stage: stageAfter, result, reachedFluent } = calculateReviewStageResult({
    stage: stageBefore,
    hadIncorrectRequiredAnswer,
  });
  const nextReviewAt = calculateNextReview({ stage: stageAfter, level: levelNumber, now });

  return { itemId, stageBefore, stageAfter, result, nextReviewAt, reachedFluent };
}
