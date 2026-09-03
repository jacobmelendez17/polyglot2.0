/**
 * Reinserts a just-answered-incorrectly review question into the remaining
 * queue (spec 09 §8): at least `spacingMinimum` other questions play first
 * when enough remain; otherwise it's pushed as late as practical; it
 * repeats immediately only when it was the sole unresolved question.
 * Deterministic — no randomness — matching spec 07's
 * `domains/lessons/retry-scheduler.ts` algorithm exactly (duplicated, not
 * shared — see `review-queue.ts`'s docstring on why).
 *
 * `remainingQueue` must already have the failed question removed from the
 * front (it was just shown and answered) — this function only decides
 * where it goes back in.
 */
export function rescheduleReviewAfterIncorrect(
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
