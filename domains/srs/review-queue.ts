import type { CurriculumLearningItem } from "@/domains/curriculum";

import { VOCABULARY_REQUIRED_DIRECTIONS } from "./review-config";
import type { ReviewQuestion, ReviewQuestionDirection } from "./review-types";

function questionId(itemId: string, direction: ReviewQuestionDirection): string {
  return `${itemId}::${direction}`;
}

/**
 * Builds every required review question for a batch of due items (spec 09
 * §7). Vocabulary is always both directions; grammar uses exactly the
 * item's configured `requiredQuestions` — never an invented or assumed
 * format. Operates on the real, database-backed `CurriculumLearningItem`
 * (spec 09 §1's "fixture curriculum/progress must not be used for
 * production review decisions"), unlike spec 07's fixture-typed
 * `domains/lessons/quiz-requirements.ts`.
 */
export function buildReviewQuestions(items: CurriculumLearningItem[]): ReviewQuestion[] {
  const questions: ReviewQuestion[] = [];

  for (const item of items) {
    if (item.type === "vocabulary") {
      for (const direction of VOCABULARY_REQUIRED_DIRECTIONS) {
        questions.push({ id: questionId(item.id, direction), itemId: item.id, itemType: "vocabulary", direction });
      }
    } else {
      for (const required of item.grammar.requiredQuestions) {
        questions.push({
          id: questionId(item.id, required.direction),
          itemId: item.id,
          itemType: "grammar",
          direction: required.direction,
        });
      }
    }
  }

  return questions;
}

/**
 * Deterministic initial review-question ordering (spec 09 §7 — "the two
 * directions for the same item should not normally appear consecutively
 * when other unresolved questions are available"). Interleaves round-robin
 * across items, identical algorithm to spec 07's
 * `domains/lessons/quiz-order.ts` — duplicated rather than shared, since
 * `domains/lessons` and `domains/srs` are intentionally independent domain
 * boundaries and the function is a handful of lines with no shared state.
 */
export function interleaveReviewQuestions(questions: ReviewQuestion[]): ReviewQuestion[] {
  const byItem = new Map<string, ReviewQuestion[]>();
  const itemOrder: string[] = [];

  for (const question of questions) {
    const existing = byItem.get(question.itemId);
    if (existing) {
      existing.push(question);
    } else {
      byItem.set(question.itemId, [question]);
      itemOrder.push(question.itemId);
    }
  }

  const result: ReviewQuestion[] = [];
  let round = 0;
  while (result.length < questions.length) {
    for (const itemId of itemOrder) {
      const group = byItem.get(itemId);
      if (group && round < group.length) {
        result.push(group[round]);
      }
    }
    round++;
  }

  return result;
}
