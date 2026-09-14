import type { ReviewQuestionAnswerSpec } from "./review-answer-spec";
import type { ClozeSentence } from "./review-cloze";
import { isClozeReviewType } from "./review-preference";
import type { ReviewType } from "./review-preference";
import type { ReviewQuestionDirection } from "./review-types";

/**
 * How the client must present one review question, and — implicitly — how
 * the learner may answer it (spec 20 Reviews' Review Types):
 *
 * - `typed`   — today's existing behavior: a prompt, a text field, the
 *   server checks it (`checkAnswer`).
 * - `reveal`  — Flashcard: the same prompt, but a "Reveal Answer" button
 *   instead of a text field, then the learner self-reports Know/Don't Know.
 * - `cloze_typed` / `cloze_reveal` — Cloze (Manual)/(Flashcard): an official
 *   example sentence with the target word blanked out, typed or
 *   self-graded the same way as `typed`/`reveal` respectively.
 *
 * `revealAnswer`/`blankedWord` never reach the client ahead of the reveal in
 * spirit — this type exists to *build* the value the server sends once the
 * learner has already asked to reveal it, not to hide it from the network
 * response before then (there is no separate "before reveal" response;
 * `ReviewQuestionView` is one payload). This mirrors how `acceptedAnswers`
 * for a typed question already isn't sent — only `expectedAnswerDisplay`
 * ever was, post-hoc, in feedback.
 */
export type ReviewQuestionPresentation =
  | { kind: "typed"; prompt: string }
  | { kind: "reveal"; prompt: string; revealAnswer: string }
  | { kind: "cloze_typed"; sentenceBefore: string; sentenceAfter: string }
  | { kind: "cloze_reveal"; sentenceBefore: string; sentenceAfter: string; revealAnswer: string };

/** Whether this presentation expects a typed, server-checked answer (`true`) or a self-graded Know/Don't Know (`false`). */
export function isTypedPresentation(presentation: ReviewQuestionPresentation): boolean {
  return presentation.kind === "typed" || presentation.kind === "cloze_typed";
}

/**
 * Resolves one question's presentation (spec 20 Reviews). Cloze only ever
 * applies to the `englishToTarget` direction — the direction that produces
 * the target-language word/structure — since example sentences are only
 * ever in the target language and there is no sentence shape for
 * "read the target word, translate it to English." A `targetToEnglish`
 * question is therefore never reshaped by Cloze: it behaves exactly like
 * Flashcard would (`reveal`) under either Cloze variant, and exactly like
 * today under Cloze (Manual) (`typed`) — see `review-queue.ts`'s
 * `buildReviewQuestions` for the companion decision this pairs with: under
 * a Cloze review type, vocabulary is asked as a single `englishToTarget`
 * question rather than the normal two (2026-09-13 user decision — "there is
 * no other direction, they only need to answer the sentence and move on").
 * Grammar keeps its item-configured `requiredQuestions` count unchanged
 * either way (spec: "Continue respecting the grammar item's configured
 * review/question requirements") — a configured `targetToEnglish` question
 * just falls into this same non-cloze branch.
 */
export function resolveReviewPresentation(input: {
  reviewType: ReviewType;
  direction: ReviewQuestionDirection;
  answerSpec: ReviewQuestionAnswerSpec;
  /** The compatible sentence for this item's target word, if one was found — irrelevant unless `direction` is `englishToTarget` and `reviewType` is a Cloze variant. */
  clozeSentence: ClozeSentence | null;
}): ReviewQuestionPresentation {
  const { reviewType, direction, answerSpec, clozeSentence } = input;

  if (isClozeReviewType(reviewType) && direction === "englishToTarget" && clozeSentence) {
    return reviewType === "cloze_manual"
      ? { kind: "cloze_typed", sentenceBefore: clozeSentence.sentenceBefore, sentenceAfter: clozeSentence.sentenceAfter }
      : {
          kind: "cloze_reveal",
          sentenceBefore: clozeSentence.sentenceBefore,
          sentenceAfter: clozeSentence.sentenceAfter,
          revealAnswer: clozeSentence.blankedWord,
        };
  }

  // Flashcard, or a Cloze variant with no compatible sentence / a direction
  // Cloze doesn't apply to — Polyglot's normal prompt, self-graded unless
  // Cloze (Manual)'s "fall back to Polyglot's normal manual vocabulary
  // review prompt" applies (typed, matching today's behavior exactly).
  return reviewType === "cloze_manual"
    ? { kind: "typed", prompt: answerSpec.prompt }
    : { kind: "reveal", prompt: answerSpec.prompt, revealAnswer: answerSpec.expectedAnswerDisplay };
}
