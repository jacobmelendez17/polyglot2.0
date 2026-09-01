import type { QuizQuestion } from "./lesson-types";

/**
 * Deterministic initial quiz-question ordering (spec 07 §22). Interleaves
 * round-robin across items — every item's first required question, then
 * every item's second, and so on — which structurally guarantees two
 * questions belonging to the same item are never adjacent (as long as the
 * batch has more than one item) without needing randomness. This is
 * separate from `retry-scheduler.ts`, which governs re-ordering after the
 * first pass.
 */
export function interleaveQuizQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  const byItem = new Map<string, QuizQuestion[]>();
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

  const result: QuizQuestion[] = [];
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
