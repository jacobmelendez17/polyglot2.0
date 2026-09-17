/**
 * Spec 20 Review UI — Auto Highlight Errors. Purely presentational: this
 * never feeds back into `checkAnswer`'s correctness decision, which has
 * already run by the time this is used — it only annotates a typed answer
 * that is already known to be incorrect, against the single
 * `expectedAnswer` the feedback already carries. That single-value shape is
 * exactly what keeps this from violating the spec's "do not fabricate a
 * character-level mismatch when multiple accepted answers... make the exact
 * error ambiguous": `expectedAnswer` was already resolved down to one
 * representative value upstream (`review-answer-spec.ts` /
 * `review-cloze.ts`), so there is no set of candidates left to be ambiguous
 * about here.
 */

export type HighlightSegment = { text: string; correct: boolean };

/** Longest Common Subsequence table, case-insensitive (matching this app's general typo/case tolerance in `check-answer.ts`), diacritics preserved (never conflate "si"/"sí" — architecture.md's rule). */
function longestCommonSubsequenceLengths(
  userAnswer: string,
  expectedAnswer: string,
): number[][] {
  const rows = userAnswer.length;
  const cols = expectedAnswer.length;
  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lengths[i][j] =
        userAnswer[i].toLowerCase() === expectedAnswer[j].toLowerCase()
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  return lengths;
}

/**
 * Marks which characters of `userAnswer` also appear, in order, in
 * `expectedAnswer` (an LCS alignment) — the unmatched ones are the
 * "incorrect portions" spec 20 asks for. Returns `null` rather than a
 * highlight so unhelpful it amounts to fabricating one: when less than half
 * of the shorter string's characters align, the two answers are close to
 * unrelated, and a char-level diff would mislead more than a plain
 * "Expected: ___" would.
 */
export function highlightAnswerDiff(
  userAnswer: string,
  expectedAnswer: string,
): HighlightSegment[] | null {
  if (userAnswer.length === 0) return null;

  const lengths = longestCommonSubsequenceLengths(userAnswer, expectedAnswer);
  const matchedLength = lengths[0][0];
  const shorterLength = Math.min(userAnswer.length, expectedAnswer.length);
  if (shorterLength === 0 || matchedLength / shorterLength < 0.5) return null;

  const matched = new Array<boolean>(userAnswer.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < userAnswer.length && j < expectedAnswer.length) {
    if (userAnswer[i].toLowerCase() === expectedAnswer[j].toLowerCase()) {
      matched[i] = true;
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const segments: HighlightSegment[] = [];
  for (let k = 0; k < userAnswer.length; k++) {
    const correct = matched[k];
    const last = segments.at(-1);
    if (last && last.correct === correct) {
      last.text += userAnswer[k];
    } else {
      segments.push({ text: userAnswer[k], correct });
    }
  }
  return segments;
}
