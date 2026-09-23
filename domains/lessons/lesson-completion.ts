import type { DbClient } from "@/db/client";
import { getEnrolledItemIds } from "@/domains/curriculum/lesson-curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import { enrollLearningItems } from "@/domains/progress/repository";
import {
  calculateNextReview,
  DEFAULT_SRS_INTERVAL_MODE,
  MINIMUM_REVIEW_STAGE,
} from "@/domains/srs";
import {
  findLanguageSettings,
  saveCurriculumPreference,
} from "@/domains/users/user-repository";
import { LessonError } from "@/lib/errors/lesson-errors";
import { logger } from "@/lib/logging/logger";
import { withTrace } from "@/lib/logging/operation-tracer";

import type { LessonCurriculumReader } from "./lesson-curriculum-reader";
import { verifyLessonState } from "./lesson-token";
import type { LessonCompletionSummary, LessonState } from "./lesson-types";

/**
 * Spec 07 unit 6 — final revalidation (§44) and atomic SRS enrollment (§45,
 * §46, §47, §48), made idempotent (§49). This replaces the deliberately
 * non-persisting `lesson-completion-preview.ts`, which is now deleted.
 *
 * What the signed token proves, and what it does not: it proves the
 * ephemeral quiz flow genuinely finished — every required question
 * satisfied, no pending retries. It proves nothing about whether enrollment
 * is *currently* valid. The database remains authoritative for that, so this
 * function re-reads curriculum and progress before writing anything, exactly
 * as §44 requires.
 *
 * Boundaries this respects, each of which spec 07 states explicitly:
 *
 * - **§46**: the SRS domain assigns the stage and schedule. Nothing here
 *   hardcodes an interval or picks a stage by name; `MINIMUM_REVIEW_STAGE`
 *   and `calculateNextReview` come from `domains/srs`.
 * - **§48**: accelerated early-level scheduling is not conditional logic
 *   here — the item's level number is handed to the SRS domain, which
 *   decides.
 * - **§46 "Side Effects Not In Scope"**: no XP, no streak, and deliberately
 *   **no level-unlock evaluation**. Lesson completion produces Beginner 1,
 *   and the unlock threshold requires Familiar 1 or above, so an unlock is
 *   unreachable from here by construction — wiring one in would be dead code
 *   that reads as if it did something.
 * - **§45**: all-or-nothing. Every write happens inside the one transaction
 *   `withIdempotency` opens; a failure on any item rolls the batch back.
 */

export type CompleteLessonInput = {
  curriculum: LessonCurriculumReader;
  token: string;
  userId: string;
  languageId: string;
  /** Client-generated UUID for this logical completion, reused verbatim on retry (§49). */
  idempotencyKey: string;
  now?: Date;
};

export type LessonCompletionResult = LessonCompletionSummary & {
  /** IDs actually enrolled by this completion, in batch order. */
  enrolledItemIds: string[];
};

/**
 * Re-derives quiz completion from the signed state alone — the same proof
 * `buildLessonCompletionPreview` performs, kept identical on purpose so the
 * results screen and the enrollment transaction can never disagree about
 * whether a lesson finished. An empty queue in the `complete` phase means
 * every required question was satisfied and no retry is pending (§41).
 */
function assertQuizCompleted(state: LessonState): void {
  if (
    state.phase !== "complete" ||
    !state.quiz ||
    state.quiz.queue.length > 0
  ) {
    throw new LessonError("LESSON_QUIZ_NOT_READY");
  }
}

/** Session accuracy (§52), computed the same way the preview does. No attempts means a perfect run, not a zero. */
function accuracyFrom(state: LessonState): number {
  const attempts = state.quiz?.attempts ?? 0;
  const correct = state.quiz?.correctAttempts ?? 0;
  return attempts === 0 ? 100 : Math.round((correct / attempts) * 100);
}

export async function completeLesson(
  db: DbClient,
  input: CompleteLessonInput,
): Promise<LessonCompletionResult> {
  const now = input.now ?? new Date();
  const state = await verifyLessonState({
    token: input.token,
    userId: input.userId,
    languageId: input.languageId,
    now: now.getTime(),
  });
  assertQuizCompleted(state);

  const batchItemIds = state.batch.map((batchItem) => batchItem.itemId);

  // Spec 24 — lesson completion is the spec's other flagship traced
  // operation. `withTrace` produces the generic
  // `lesson.transaction.started`/`.succeeded`/`.failed` triplet; the
  // domain-specific milestones below are logged explicitly, correlated
  // under the same trace id. Never logs item labels/meanings/content —
  // only safe identifiers and counts (spec's "Never log complete lesson
  // content").
  return withTrace(
    "lesson.transaction",
    () =>
      withIdempotency(
        db,
        {
          userId: input.userId,
          operation: "lesson.complete",
          key: input.idempotencyKey,
          // The batch identity is the payload. A replay with the same key and the
          // same batch returns the original result; a reused key with a different
          // batch is rejected by `withIdempotency` rather than enrolling anything.
          payload: {
            languageId: input.languageId,
            itemIds: [...batchItemIds].sort(),
          },
        },
        async (tx) => {
          // §44 — revalidate against authoritative state, not the token.
          const items =
            await input.curriculum.getLearningItemsByIds(batchItemIds);
          if (items.length !== batchItemIds.length) {
            // An item was unpublished, archived, or deleted between study and
            // completion. Enrolling a partial batch would violate §45.
            throw new LessonError("CURRICULUM_VALIDATION_FAILED");
          }
          if (items.some((item) => item.languageId !== input.languageId)) {
            throw new LessonError("CURRICULUM_VALIDATION_FAILED");
          }

          // §44's "Already-Enrolled Batches": reject the whole completion rather
          // than enrolling the remainder or silently skipping duplicates.
          const alreadyEnrolled = await getEnrolledItemIds(
            tx,
            input.userId,
            batchItemIds,
          );
          if (alreadyEnrolled.length > 0) {
            throw new LessonError("LESSON_ALREADY_ENROLLED");
          }
          logger.debug({
            event: "lesson.items_validated",
            userId: input.userId,
            itemCount: batchItemIds.length,
          });

          const orderedItems = batchItemIds.map((itemId) =>
            items.find((item) => item.id === itemId)!,
          );

          await enrollLearningItems(
            tx,
            input.userId,
            orderedItems.map((item) => ({
              learningItemId: item.id,
              languageId: item.languageId,
              srsStage: MINIMUM_REVIEW_STAGE,
              learnedAt: now,
              // §47/§48 — the SRS domain decides the first review time from the
              // stage, the curriculum level, and authoritative server time.
              // `mode` is spec 20 SRS Interval's per-learner preference, but
              // Beginner 1's interval is fixed (4 hours) under every mode — a
              // freshly enrolled item has no review-session context to resolve
              // a real preference from anyway, so this is never a live choice.
              nextReviewAt: calculateNextReview({
                stage: MINIMUM_REVIEW_STAGE,
                level: item.levelNumber,
                mode: DEFAULT_SRS_INTERVAL_MODE,
                now,
              }),
            })),
          );

          logger.info({
            event: "lesson.completed",
            userId: input.userId,
            languageId: input.languageId,
            itemCount: orderedItems.length,
            newStage: MINIMUM_REVIEW_STAGE,
            accuracy: accuracyFrom(state),
          });

          // Choose Group as You Go re-prompts on every lesson start, not
          // just once a group empties (user decision, 2026-09-23) — see
          // `domains/users/curriculum-preference.ts`'s
          // `isThemeSelectionRequired` for the full rule. This is the other
          // half of that rule: an *active* selection is honored for the
          // one lesson it was made for, then cleared back to `null` right
          // here, on real completion, so the *next* `startLesson` call
          // asks again instead of silently continuing in the same group.
          // Scoped to `choose_group` specifically — every other mode
          // already always stores `null` here (the database enforces it),
          // so this is a genuine no-op for them, not a mode switch.
          const settings = await findLanguageSettings(
            tx,
            input.userId,
            input.languageId,
          );
          if (
            settings?.curriculumMode === "choose_group" &&
            settings.selectedVocabularyGroupId !== null
          ) {
            await saveCurriculumPreference(tx, {
              userId: input.userId,
              languageId: input.languageId,
              curriculumMode: "choose_group",
              selectedVocabularyGroupId: null,
            });
          }

          return {
            items: orderedItems.map((item) => ({
              id: item.id,
              label: item.type === "vocabulary" ? item.word : item.structure,
              meaning:
                item.type === "vocabulary"
                  ? (item.meanings[0] ?? "")
                  : item.meaning,
            })),
            newStage: MINIMUM_REVIEW_STAGE,
            accuracy: accuracyFrom(state),
            enrolledItemIds: orderedItems.map((item) => item.id),
          };
        },
      ),
    {
      level: "info",
      fields: { userId: input.userId, languageId: input.languageId },
    },
  );
}
