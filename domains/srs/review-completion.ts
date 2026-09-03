import type { DbClient } from "@/db/client";
import { getLearningItem, getLevelById, getLevelsByLanguage } from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import {
  applyItemProgressUpdate,
  countLevelGatingItems,
  countUserItemsAtOrAboveStageInLevel,
  lockItemProgressForReview,
  unlockLevel,
} from "@/domains/progress/repository";
import { ReviewError } from "@/lib/errors/review-errors";

import { LEVEL_UNLOCK_MINIMUM_STAGE, LEVEL_UNLOCK_RATIO } from "./review-config";
import { insertReviewEvent } from "./review-repository";
import { calculateReviewStageResult } from "./review-result";
import { SRS_STAGE_ORDER } from "./srs-config";
import { calculateNextReview, getStageIndex, isReviewDue } from "./srs-rules";
import type { ReviewItemCompletionPreview } from "./review-types";

/**
 * The real atomic review-completion transaction (spec 09 §10, unit 4) —
 * replaces `review-completion-preview.ts`'s stand-in as the thing
 * `review-orchestration.ts`'s `submitReviewAnswer` calls once an item's
 * required questions are all satisfied. Follows §10's step order exactly:
 * authentication and rate-limiting happen in the caller (`review-service.ts`
 * — rate-limiting is server-only-guarded and this module must stay
 * `DbClient`-injectable and testable, matching every other domain boundary
 * decision in this spec); idempotency-key validation and the transaction
 * boundary are `withIdempotency`'s job; everything from "lock/reload
 * user_item_progress" through "persist newly earned level unlock" happens
 * inside `fn`, all sharing the one transaction `withIdempotency` opens.
 *
 * SRS calculation itself stays entirely `domains/srs`'s (spec 09 §9) —
 * `domains/progress`'s repository functions only ever apply a stage/schedule
 * this module already computed; they never decide it.
 */

export type ApplyReviewCompletionInput = {
  userId: string;
  languageId: string;
  learningItemId: string;
  /** The review-session snapshot's stage version — mismatch means another completion already changed this item (spec 09 §11). */
  expectedVersion: number;
  requiredQuestionCount: number;
  hadIncorrectRequiredAnswer: boolean;
  now: Date;
  /** Client-generated UUID, stable for this item's completion across retries (spec 09 §12). */
  idempotencyKey: string;
  /** Included in the idempotency payload so a key reused for a different item/session is rejected as a conflict rather than silently misapplied. */
  sessionId: string;
};

export async function applyReviewCompletion(
  db: DbClient,
  input: ApplyReviewCompletionInput,
): Promise<ReviewItemCompletionPreview> {
  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "review-complete",
      key: input.idempotencyKey,
      payload: {
        sessionId: input.sessionId,
        learningItemId: input.learningItemId,
        expectedVersion: input.expectedVersion,
        hadIncorrectRequiredAnswer: input.hadIncorrectRequiredAnswer,
      },
    },
    async (tx) => {
      const locked = await lockItemProgressForReview(tx, {
        userId: input.userId,
        learningItemId: input.learningItemId,
        languageId: input.languageId,
      });
      if (!locked) throw new ReviewError("ITEM_NOT_FOUND");
      if (locked.version !== input.expectedVersion) throw new ReviewError("STALE_REVIEW");
      if (!isReviewDue({ nextReviewAt: locked.nextReviewAt, now: input.now })) {
        throw new ReviewError("REVIEW_NOT_DUE");
      }

      const curriculumItem = await getLearningItem(tx, input.learningItemId);
      if (!curriculumItem) throw new ReviewError("ITEM_NOT_FOUND");
      const level = await getLevelById(tx, curriculumItem.levelId);
      if (!level) throw new ReviewError("ITEM_NOT_FOUND");

      const { stage: stageAfter, result, reachedFluent } = calculateReviewStageResult({
        stage: locked.srsStage,
        hadIncorrectRequiredAnswer: input.hadIncorrectRequiredAnswer,
      });
      const nextReviewAt = calculateNextReview({ stage: stageAfter, level: level.levelNumber, now: input.now });
      const fluentAt = reachedFluent ? input.now : locked.fluentAt;

      const updated = await applyItemProgressUpdate(tx, {
        userId: input.userId,
        learningItemId: input.learningItemId,
        expectedVersion: locked.version,
        srsStage: stageAfter,
        nextReviewAt,
        fluentAt,
        result,
        now: input.now,
      });
      // Re-checked defensively — should be unreachable given the row lock
      // held since `lockItemProgressForReview`, but a real rejection here
      // must never be silently swallowed.
      if (!updated) throw new ReviewError("STALE_REVIEW");

      await insertReviewEvent(tx, {
        userId: input.userId,
        languageId: input.languageId,
        learningItemId: input.learningItemId,
        reviewedAt: input.now,
        stageBefore: locked.srsStage,
        stageAfter,
        requiredQuestionCount: input.requiredQuestionCount,
        incorrectAdjustmentCount: input.hadIncorrectRequiredAnswer ? 1 : 0,
        result,
      });

      await evaluateLevelUnlock(tx, { userId: input.userId, languageId: input.languageId, completedLevel: level, now: input.now });

      return { itemId: input.learningItemId, stageBefore: locked.srsStage, stageAfter, result, nextReviewAt, reachedFluent };
    },
  );
}

const QUALIFYING_STAGES = SRS_STAGE_ORDER.slice(getStageIndex(LEVEL_UNLOCK_MINIMUM_STAGE));

type CurriculumLevel = Awaited<ReturnType<typeof getLevelById>>;

/**
 * Spec 09 §15: after every completed review (advance or penalty — a prior
 * unlock is never revoked, but crossing the threshold can happen on any
 * completion), check whether the *next* level past the just-reviewed item's
 * level has now earned its unlock, and persist it if so. A no-op when
 * there's no next level, or the ratio isn't met yet.
 */
async function evaluateLevelUnlock(
  tx: DbClient,
  { userId, languageId, completedLevel, now }: { userId: string; languageId: string; completedLevel: NonNullable<CurriculumLevel>; now: Date },
): Promise<void> {
  const levels = await getLevelsByLanguage(tx, languageId);
  const nextLevel = levels.find((level) => level.levelNumber === completedLevel.levelNumber + 1);
  if (!nextLevel) return;

  const [totalGatingItems, itemsAtOrAboveThreshold] = await Promise.all([
    countLevelGatingItems(tx, completedLevel.id),
    countUserItemsAtOrAboveStageInLevel(tx, { userId, levelId: completedLevel.id, qualifyingStages: QUALIFYING_STAGES }),
  ]);

  if (totalGatingItems === 0) return;
  if (itemsAtOrAboveThreshold / totalGatingItems < LEVEL_UNLOCK_RATIO) return;

  await unlockLevel(tx, { userId, levelId: nextLevel.id, now });
}
