import type { DbClient } from "@/db/client";
import {
  getLearningItem,
  getLevelById,
  getLevelsByLanguage,
} from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import {
  applyItemProgressUpdate,
  countLevelGatingItems,
  countUserItemsAtOrAboveStageInLevel,
  lockItemProgressForReview,
  unlockLevel,
} from "@/domains/progress/repository";
import { ReviewError } from "@/lib/errors/review-errors";
import { logger } from "@/lib/logging/logger";
import { withTrace } from "@/lib/logging/operation-tracer";

import {
  LEVEL_UNLOCK_MINIMUM_STAGE,
  LEVEL_UNLOCK_RATIO,
} from "./review-config";
import type {
  ReviewQueueTimingMode,
  SrsIntervalMode,
  SrsStrictness,
} from "./review-preference";
import { applyReviewQueueTiming } from "./review-queue-timing";
import { insertReviewEvent } from "./review-repository";
import { calculateReviewStageResult } from "./review-result";
import { SRS_STAGE_ORDER } from "./srs-config";
import {
  calculateFluentMaintenanceReview,
  calculateNextReview,
  getStageIndex,
  isReviewDue,
} from "./srs-rules";
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
  /** Spec 20 SRS Strictness — which demotion rule applies to this item if `hadIncorrectRequiredAnswer` is true. Resolved by the caller from the item's content type and the session's signed-in preferences. */
  srsStrictness: SrsStrictness;
  /** Spec 20 SRS Interval — which schedule resolves the next review's due date on a correct/advancing result. Resolved by the caller the same way as `srsStrictness`. */
  srsIntervalMode: SrsIntervalMode;
  /** Spec 20 Review Queue Timing — the final rounding step applied to the raw due time this completion computes. Resolved by the caller the same way as `srsStrictness`/`srsIntervalMode`. Never applied to a Fluent Mode maintenance schedule — see `fluentMode`. */
  reviewQueueTiming: ReviewQueueTimingMode;
  /** The learner's timezone at session start (spec 20 Review Queue Timing — Start of Day). Only read when `reviewQueueTiming` is `"start_of_day"`. */
  timeZone: string;
  /**
   * Spec 20 Fluent Mode — whether this item's content type schedules a
   * 6-calendar-month maintenance review when a completion lands on Fluent
   * (`true`), or terminates outright (`false`, `nextReviewAt = null`).
   * Resolved by the caller the same way as `srsStrictness`/`srsIntervalMode`.
   * Only consulted when `stageAfter` is `"fluent"` — bypasses SRS Interval
   * and Review Queue Timing entirely rather than layering on top of them
   * (spec's own pipeline: "raw next-review timestamp -> Review Queue Timing
   * -> Fluent behavior if applicable" — Fluent overrides, it doesn't refine).
   */
  fluentMode: boolean;
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
  // Spec 24 — the atomic review-completion transaction is one of the two
  // flagship traced operations named by the spec. `withTrace` here produces
  // the `review.transaction.started`/`.succeeded`/`.failed` triplet from
  // spec's own "Recommended Trace Example"; domain-specific milestones
  // (`review.eligibility.validated`, `review.completed`) are logged
  // explicitly below, correlated under the same trace id.
  return withTrace(
    "review.transaction",
    () =>
      withIdempotency(
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
          if (locked.version !== input.expectedVersion)
            throw new ReviewError("STALE_REVIEW");
          if (
            !isReviewDue({ nextReviewAt: locked.nextReviewAt, now: input.now })
          ) {
            throw new ReviewError("REVIEW_NOT_DUE");
          }
          logger.debug({
            event: "review.eligibility.validated",
            userId: input.userId,
            itemId: input.learningItemId,
          });

          const curriculumItem = await getLearningItem(
            tx,
            input.learningItemId,
          );
          if (!curriculumItem) throw new ReviewError("ITEM_NOT_FOUND");
          const level = await getLevelById(tx, curriculumItem.levelId);
          if (!level) throw new ReviewError("ITEM_NOT_FOUND");

          const {
            stage: stageAfter,
            result,
            reachedFluent,
          } = calculateReviewStageResult({
            stage: locked.srsStage,
            hadIncorrectRequiredAnswer: input.hadIncorrectRequiredAnswer,
            srsStrictness: input.srsStrictness,
          });
          // The historical "when did this item first become Fluent" record —
          // set once, on the completion that first reaches Fluent, and
          // preserved through every later Fluent-maintenance review. Persisted
          // for `domains/progress/repository.ts`'s `reconcileFluentSchedules`
          // (the *toggle*-driven backfill for items that have been sitting
          // terminal — that is the one place spec 20's "Use fluentAt + 6
          // calendar months. Do not use settingChangedAt + 6 months" applies).
          // The *live* maintenance loop below is a different rule and does not
          // read this value.
          const fluentAt = reachedFluent ? input.now : locked.fluentAt;

          let nextReviewAt: Date | null;
          if (stageAfter === "fluent") {
            // Spec 20 Fluent Mode's "Fluent Mode On": "next review in 6 calendar
            // months," computed fresh from *this* completion the same way every
            // other stage's interval is computed from `now` — not from the
            // original `fluentAt`, which would silently stop advancing after
            // the first maintenance cycle. Bypasses SRS Interval / Review Queue
            // Timing outright rather than refining their output.
            nextReviewAt = input.fluentMode
              ? calculateFluentMaintenanceReview(input.now)
              : null;
          } else {
            const rawNextReviewAt = calculateNextReview({
              stage: stageAfter,
              level: level.levelNumber,
              mode: input.srsIntervalMode,
              now: input.now,
            });
            // Spec 20 Review Queue Timing — the pipeline's last step, applied to
            // every freshly-computed due time regardless of advance/penalty.
            nextReviewAt =
              rawNextReviewAt &&
              applyReviewQueueTiming(
                rawNextReviewAt,
                input.reviewQueueTiming,
                input.timeZone,
              );
          }

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

          await evaluateLevelUnlock(tx, {
            userId: input.userId,
            languageId: input.languageId,
            completedLevel: level,
            now: input.now,
          });

          // Spec 24 — the domain-specific completion outcome (safe SRS
          // metadata only: never the learner's typed answer). Distinct from
          // `review.transaction.succeeded` (the generic transaction-lifecycle
          // line `withTrace` already emits) — this is what an operator
          // searching one `trace_id` actually wants to know happened.
          logger.info({
            event: "review.completed",
            userId: input.userId,
            itemId: input.learningItemId,
            stageBefore: locked.srsStage,
            stageAfter,
            result,
            reachedFluent,
          });

          return {
            itemId: input.learningItemId,
            stageBefore: locked.srsStage,
            stageAfter,
            result,
            nextReviewAt,
            reachedFluent,
          };
        },
      ),
    {
      level: "info",
      fields: {
        userId: input.userId,
        languageId: input.languageId,
        itemId: input.learningItemId,
      },
    },
  );
}

const QUALIFYING_STAGES = SRS_STAGE_ORDER.slice(
  getStageIndex(LEVEL_UNLOCK_MINIMUM_STAGE),
);

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
  {
    userId,
    languageId,
    completedLevel,
    now,
  }: {
    userId: string;
    languageId: string;
    completedLevel: NonNullable<CurriculumLevel>;
    now: Date;
  },
): Promise<void> {
  const levels = await getLevelsByLanguage(tx, languageId);
  const nextLevel = levels.find(
    (level) => level.levelNumber === completedLevel.levelNumber + 1,
  );
  if (!nextLevel) return;

  const [totalGatingItems, itemsAtOrAboveThreshold] = await Promise.all([
    countLevelGatingItems(tx, completedLevel.id),
    countUserItemsAtOrAboveStageInLevel(tx, {
      userId,
      levelId: completedLevel.id,
      qualifyingStages: QUALIFYING_STAGES,
    }),
  ]);

  if (totalGatingItems === 0) return;
  if (itemsAtOrAboveThreshold / totalGatingItems < LEVEL_UNLOCK_RATIO) return;

  await unlockLevel(tx, { userId, levelId: nextLevel.id, now });
}
