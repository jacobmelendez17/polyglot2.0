/**
 * Reinserts a just-answered-incorrectly question into the remaining queue,
 * per spec 07 §33–§37: at least `spacingMinimum` other questions play first
 * when enough remain; otherwise it's pushed as late as practical; it repeats
 * immediately only when it was the sole unresolved question. Deterministic —
 * no randomness — which satisfies §37 ("a deterministic spacing algorithm is
 * also acceptable") while keeping retry ordering reproducible in tests.
 *
 * `remainingQueue` must already have the failed question removed from the
 * front (it was just shown and answered) — this function only decides where
 * it goes back in.
 */
export function rescheduleAfterIncorrect(
  remainingQueue: string[],
  failedQuestionId: string,
  spacingMinimum: number,
): string[] {
  if (remainingQueue.length === 0) {
    return [failedQuestionId];
  }

  const insertAt = Math.min(spacingMinimum, remainingQueue.length);
  return [...remainingQueue.slice(0, insertAt), failedQuestionId, ...remainingQueue.slice(insertAt)];
}
