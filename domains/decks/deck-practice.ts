import type { CurriculumLearningItem } from "@/domains/curriculum";
import type { ReviewQuestionDirection } from "@/domains/srs";
import {
  buildReviewQuestions,
  getReviewQuestionAnswerSpec,
  interleaveReviewQuestions,
} from "@/domains/srs";

import type { DeckPracticeQuestion, DeckPracticeVerdict } from "./deck-types";

/**
 * Pure deck-practice rules (spec 14's "Practice"). No database, no React,
 * and — most importantly — nothing that can touch SRS state.
 *
 * The question set itself is not reinvented here: spec 14 says to use "the
 * existing mixed vocabulary practice types for vocabulary and existing
 * configured grammar practice behavior for grammar", so this delegates to
 * `domains/srs`'s already-tested `buildReviewQuestions` (vocabulary in both
 * required directions; grammar in exactly its configured `requiredQuestions`)
 * and `interleaveReviewQuestions` through that domain's public API. What
 * deck practice does *not* borrow from `domains/srs` is everything that
 * writes: no snapshot, no version check, no completion transaction, no
 * scheduling.
 *
 * Deck practice is also a single pass — an incorrect answer is shown and the
 * session moves on, rather than being requeued. Requeuing exists in lessons
 * and reviews to gate an SRS outcome (an item may not enter or advance a
 * stage until it is answered correctly); spec 14 removes that outcome
 * entirely, so there is nothing left for a retry to gate.
 */

function directionLabel(
  languageName: string,
  direction: ReviewQuestionDirection,
): string {
  return direction === "targetToEnglish"
    ? `${languageName} → English`
    : `English → ${languageName}`;
}

/** How an item is named in the Know / Don't Know summary, where a bare prompt would be ambiguous. */
export function deckItemLabel(item: CurriculumLearningItem): string {
  if (item.type === "vocabulary") {
    const { term, article } = item.vocabulary;
    return article ? `${article} ${term}` : term;
  }
  return item.grammar.structure;
}

/**
 * Every practice prompt for a deck session, interleaved so an item's two
 * directions do not normally appear back to back. Accepted answers are
 * deliberately absent from the result — the browser receives prompts only,
 * and the server grades (`gradeDeckPracticeAnswer`).
 */
export function buildDeckPracticeQuestions(
  items: CurriculumLearningItem[],
  languageName: string,
): DeckPracticeQuestion[] {
  const itemById = new Map(items.map((item) => [item.id, item]));

  return interleaveReviewQuestions(buildReviewQuestions(items)).flatMap(
    (question) => {
      const item = itemById.get(question.itemId);
      if (!item) return [];
      // Synonyms only widen the accepted-answer set; the prompt itself never
      // depends on them, so an empty list here is correct rather than a
      // shortcut. Grading loads the learner's real synonyms separately.
      const spec = getReviewQuestionAnswerSpec(item, question.direction, []);
      return [
        {
          questionId: question.id,
          learningItemId: question.itemId,
          itemType: question.itemType,
          direction: question.direction,
          prompt: spec.prompt,
          directionLabel: directionLabel(languageName, question.direction),
          itemLabel: deckItemLabel(item),
        },
      ];
    },
  );
}

export type DeckPracticeClassification = {
  learningItemId: string;
  itemLabel: string;
  verdict: DeckPracticeVerdict;
};

export type DeckPracticeSummary = {
  knowCount: number;
  dontKnowCount: number;
  know: DeckPracticeClassification[];
  dontKnow: DeckPracticeClassification[];
};

/**
 * Groups a finished session's self-classifications (spec 14's "Deck
 * Complete / Know: 18 / Don't Know: 6" summary and its groupable result
 * list). Session-only by construction: this takes the classifications as an
 * argument and returns a view model — nothing here reads or writes storage,
 * and no caller persists the result.
 *
 * The last verdict for an item wins, so re-classifying an item during a
 * session never double-counts it.
 */
export function summarizeDeckPractice(
  classifications: DeckPracticeClassification[],
): DeckPracticeSummary {
  const latestByItem = new Map<string, DeckPracticeClassification>();
  for (const classification of classifications) {
    latestByItem.set(classification.learningItemId, classification);
  }

  const know: DeckPracticeClassification[] = [];
  const dontKnow: DeckPracticeClassification[] = [];
  for (const classification of latestByItem.values()) {
    if (classification.verdict === "know") know.push(classification);
    else dontKnow.push(classification);
  }

  return {
    knowCount: know.length,
    dontKnowCount: dontKnow.length,
    know,
    dontKnow,
  };
}
