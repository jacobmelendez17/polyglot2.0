import type { CheckAnswerInput, CheckAnswerResult } from "./answer-checking-types";

/**
 * Normalizes for comparison without erasing meaningful diacritics/accents,
 * per architecture.md's duplicate-normalization rule ("si" and "sí" must
 * remain distinct terms). Only whitespace and case are collapsed.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Levenshtein edit distance, used only to tolerate minor typos. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) distances[i][0] = i;
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost,
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

/**
 * A short word must match exactly; a longer word tolerates a single-character
 * typo (insertion, deletion, or substitution), since a one-character slip on
 * a two- or three-letter word usually changes the word entirely.
 */
function matches(userAnswer: string, accepted: string): boolean {
  const normalizedUser = normalize(userAnswer);
  const normalizedAccepted = normalize(accepted);

  if (normalizedUser === normalizedAccepted) return true;
  if (normalizedAccepted.length <= 3) return false;

  return editDistance(normalizedUser, normalizedAccepted) <= 1;
}

/**
 * Server-authoritative answer evaluation (spec 07 §29). Callers are
 * responsible for loading `acceptedAnswers`/`articleRequirement` from
 * authoritative curriculum data and for skipping empty submissions before
 * calling this (spec 07 §28 — an empty submission is not an attempt).
 */
export function checkAnswer({
  userAnswer,
  acceptedAnswers,
  articleRequirement,
}: CheckAnswerInput): CheckAnswerResult {
  const isCorrect = acceptedAnswers.some((accepted) => matches(userAnswer, accepted));
  if (isCorrect) return { isCorrect: true };

  if (articleRequirement) {
    const matchedBareForm = articleRequirement.bareAnswers.some((bare) => matches(userAnswer, bare));
    if (matchedBareForm) {
      return { isCorrect: false, reason: "missing_article", article: articleRequirement.article };
    }
  }

  return { isCorrect: false, reason: "no_match" };
}
