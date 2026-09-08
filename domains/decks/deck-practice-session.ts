import type { DbClient } from "@/db/client";
import { getLanguageById, getLearningItemsByIds } from "@/domains/curriculum/curriculum-repository";
import { getSynonyms } from "@/domains/learner-content/repository";
import type { ReviewQuestionDirection } from "@/domains/srs";
import { getCharacterHelpers, getReviewQuestionAnswerSpec } from "@/domains/srs";
import { checkAnswer } from "@/lib/answer-checking";
import { DeckError } from "@/lib/errors/deck-errors";

import { buildDeckPracticeQuestions } from "./deck-practice";
import { getDeckForLearner, isDeckItemPracticable } from "./deck-repository";
import type { DeckPracticeFeedback, DeckPracticeQuestion } from "./deck-types";

/**
 * Deck-practice orchestration (spec 14's "Practice"). Injectable
 * `DbClient`, calling the repository tier of `domains/curriculum` and
 * `domains/learner-content` directly, for the same reason
 * `domains/srs/review-orchestration.ts` does: those domains' real-db-bound
 * `server.ts` modules import the `server-only`-guarded database client and
 * would make this module untestable.
 *
 * **The one thing this must never do is write.** Deck practice changes no
 * SRS stage, no next-review time, no review statistic, no curriculum
 * progress, and no level unlock. There is no completion transaction here
 * because there is nothing to commit — every function below is a read plus a
 * pure calculation.
 *
 * Unlike the review flow, there is no signed session token. A review token
 * exists because an authoritative SRS mutation follows it and the server
 * must be able to trust what the browser hands back. Nothing follows a deck
 * answer, so session state — the queue, the running counts, and the
 * session-only Know / Don't Know verdicts — lives in React state on the
 * client, which is exactly what "session-only" means for the spec. What the
 * server still refuses to delegate is grading: accepted answers are never
 * shipped to the browser, and `gradeDeckPracticeAnswer` re-checks deck
 * visibility and item membership on every single submission.
 */

export type StartDeckPracticeInput = { userId: string; languageId: string; deckId: string };

export type DeckPracticeSession = {
  deckId: string;
  deckName: string;
  questions: DeckPracticeQuestion[];
  /** Distinct items in this session — the denominator for Know / Don't Know. */
  itemCount: number;
  /** Resolved server-side from the deck's language, exactly as the review flow does — the client never hardcodes these. */
  characterHelpers: readonly string[];
};

export async function startDeckPractice(db: DbClient, input: StartDeckPracticeInput): Promise<DeckPracticeSession> {
  const deck = await getDeckForLearner(db, input);
  if (!deck) throw new DeckError("DECK_NOT_FOUND");
  if (deck.items.length === 0) throw new DeckError("DECK_MUST_HAVE_ITEMS");

  const itemIds = deck.items.map((item) => item.learningItemId);
  const [curriculumItems, language] = await Promise.all([
    getLearningItemsByIds(db, itemIds),
    getLanguageById(db, input.languageId),
  ]);
  if (!language) throw new DeckError("DECK_NOT_FOUND");

  // Preserve the deck's own explicit ordering — `getLearningItemsByIds`
  // makes no ordering promise, and spec 14 lets a learner order a personal
  // deck deliberately.
  const byId = new Map(curriculumItems.map((item) => [item.id, item]));
  const orderedItems = itemIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });

  return {
    deckId: deck.id,
    deckName: deck.name,
    questions: buildDeckPracticeQuestions(orderedItems, language.name),
    itemCount: orderedItems.length,
    characterHelpers: getCharacterHelpers(language.code),
  };
}

export type GradeDeckPracticeAnswerInput = {
  userId: string;
  languageId: string;
  deckId: string;
  learningItemId: string;
  direction: ReviewQuestionDirection;
  answer: string;
};

/**
 * Grades one practice answer and returns feedback. Nothing is persisted, and
 * nothing about the learner's SRS state is read beyond what
 * `isDeckItemPracticable` needs to confirm they may practice this item at
 * all.
 */
export async function gradeDeckPracticeAnswer(
  db: DbClient,
  input: GradeDeckPracticeAnswerInput,
): Promise<DeckPracticeFeedback> {
  const practicable = await isDeckItemPracticable(db, {
    userId: input.userId,
    languageId: input.languageId,
    deckId: input.deckId,
    learningItemId: input.learningItemId,
  });
  if (!practicable) throw new DeckError("DECK_ITEM_NOT_FOUND");

  const [item] = await getLearningItemsByIds(db, [input.learningItemId]);
  if (!item) throw new DeckError("DECK_ITEM_NOT_FOUND");

  const synonyms = await getSynonyms(db, input.userId, input.learningItemId);
  const spec = getReviewQuestionAnswerSpec(item, input.direction, synonyms);
  const result = checkAnswer({
    userAnswer: input.answer.trim(),
    acceptedAnswers: spec.acceptedAnswers,
    articleRequirement: spec.articleRequirement,
  });

  if (result.isCorrect) return { kind: "correct" };

  return result.reason === "missing_article"
    ? {
        kind: "incorrect",
        reason: "missing_article",
        article: result.article,
        userAnswer: input.answer.trim(),
        expectedAnswer: spec.expectedAnswerDisplay,
      }
    : {
        kind: "incorrect",
        reason: "no_match",
        userAnswer: input.answer.trim(),
        expectedAnswer: spec.expectedAnswerDisplay,
      };
}
