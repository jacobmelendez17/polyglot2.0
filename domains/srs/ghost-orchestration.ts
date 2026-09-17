import type { DbClient } from "@/db/client";
import {
  getLearningItem,
  getSentenceById,
} from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import { checkAnswer } from "@/lib/answer-checking";
import { ReviewError } from "@/lib/errors/review-errors";

import { applyGhostAnswer, getGhostProgressById } from "./ghost-repository";
import type { GhostStage } from "./ghost-progress";
import { findCompatibleClozeSentence } from "./review-cloze";

/**
 * Spec 20 Ghost Reviews — grading a Ghost review. Deliberately separate
 * from `review-orchestration.ts`'s `submitReviewAnswer`: a Ghost review
 * needs no signed session token at all (see `review-types.ts`'s
 * `GhostReviewView` docstring for why) — this is a plain authenticated
 * request/response, ownership-checked directly against the real
 * `user_sentence_ghost_progress` row.
 */

export type SubmitGhostAnswerInput = {
  userId: string;
  languageId: string;
  ghostProgressId: string;
  answer: string;
  /** Client-generated UUID, stable for this Ghost review's completion across retries — the same replay-safety contract `SubmitReviewAnswerInput.idempotencyKey` already uses. */
  idempotencyKey: string;
  now?: number;
};

export type SubmitGhostAnswerResult = {
  isCorrect: boolean;
  /** True once this Ghost has finished all four stages ("Ghost is gone") — the client should stop showing it. */
  completed: boolean;
  ghostStage: GhostStage;
  nextReviewAt: Date | null;
  /** Only present when incorrect — matches normal review feedback's "show what was expected" shape. */
  expectedAnswer?: string;
};

export async function submitGhostAnswer(
  db: DbClient,
  input: SubmitGhostAnswerInput,
): Promise<SubmitGhostAnswerResult> {
  const now = new Date(input.now ?? Date.now());

  const ghost = await getGhostProgressById(
    db,
    input.userId,
    input.ghostProgressId,
  );
  if (!ghost || ghost.languageId !== input.languageId || !ghost.ghostStage) {
    throw new ReviewError("ITEM_NOT_FOUND");
  }

  const [item, sentence] = await Promise.all([
    getLearningItem(db, ghost.learningItemId),
    getSentenceById(db, ghost.sentenceId),
  ]);
  if (!item || !sentence) throw new ReviewError("ITEM_NOT_FOUND");

  // Never trust anything client-supplied for the accepted answer — re-derive
  // the exact same Cloze blank server-side, the same discipline
  // `resolveQuestionPresentation` uses for normal Cloze questions.
  const targetWord =
    item.type === "vocabulary" ? item.vocabulary.term : item.grammar.structure;
  const cloze = findCompatibleClozeSentence([sentence], targetWord);
  // Defensive only — this exact sentence/item pairing is how the Ghost was created in the first place.
  if (!cloze) throw new ReviewError("ITEM_NOT_FOUND");

  const trimmedAnswer = input.answer.trim();
  const result = checkAnswer({
    userAnswer: trimmedAnswer,
    acceptedAnswers: [cloze.blankedWord],
  });
  const isCorrect = result.isCorrect;

  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "ghost-answer",
      key: input.idempotencyKey,
      payload: { ghostProgressId: input.ghostProgressId, isCorrect },
    },
    async (tx) => {
      const applied = await applyGhostAnswer(tx, {
        userId: input.userId,
        ghostProgressId: input.ghostProgressId,
        isCorrect,
        now,
      });
      // Unreachable given the check above (same transaction-free read just confirmed this Ghost exists and belongs to this user) — kept as a defensive guard rather than a non-null assertion.
      if (!applied) throw new ReviewError("ITEM_NOT_FOUND");

      return {
        isCorrect,
        completed: applied.kind === "completed",
        ghostStage: applied.ghostProgress.ghostStage!,
        nextReviewAt: applied.ghostProgress.nextReviewAt,
        expectedAnswer: isCorrect ? undefined : cloze.blankedWord,
      };
    },
  );
}
