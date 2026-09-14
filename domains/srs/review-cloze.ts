import type { CurriculumExampleSentence } from "@/domains/curriculum";

export type ClozeSentence = {
  /** The underlying `sentences.id` — spec 20 Ghost Reviews needs to know exactly which sentence a missed question showed. */
  sentenceId: string;
  /** The sentence's text before the blanked word, verbatim. */
  sentenceBefore: string;
  /** The sentence's text after the blanked word, verbatim. */
  sentenceAfter: string;
  /** The exact substring that was blanked, in the sentence's own form/casing — the authoritative accepted answer, never re-derived from `targetWord`. */
  blankedWord: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the first official example sentence that literally contains
 * `targetWord` as a whole word (spec 20 Reviews' "Use an official example
 * sentence containing the vocabulary term" / "...for the grammar point" —
 * literal containment of the term/structure itself, not an inflected form,
 * so nothing here invents a sentence or guesses a conjugation). Word-
 * boundary matched with Unicode letter classes (`\p{L}`), not `\b`, since
 * JS's ASCII `\b` misclassifies accented letters common in target-language
 * content (e.g. "días"). Case-insensitive; the blanked word returned is
 * copied verbatim from the sentence, casing included, so the accepted
 * answer is exactly what the learner sees once revealed — never re-derived
 * from `targetWord`.
 *
 * Returns `null` when no example is compatible — the caller falls back to
 * Polyglot's normal (non-cloze) prompt for that item, per spec.
 */
export function findCompatibleClozeSentence(
  examples: readonly CurriculumExampleSentence[],
  targetWord: string,
): ClozeSentence | null {
  const pattern = new RegExp(`(?<![\\p{L}])(${escapeRegExp(targetWord)})(?![\\p{L}])`, "iu");

  for (const example of examples) {
    const match = pattern.exec(example.targetText);
    if (!match) continue;

    const start = match.index;
    const end = start + match[1].length;
    return {
      sentenceId: example.id,
      sentenceBefore: example.targetText.slice(0, start),
      sentenceAfter: example.targetText.slice(end),
      blankedWord: example.targetText.slice(start, end),
    };
  }

  return null;
}
