/**
 * Spec 20 General — Vacation Scheduling. The one authoritative rule for
 * "how much does a vacation shift a scheduled review" — architecture.md's
 * "Only the SRS domain may authoritatively assign... next-review time"
 * covers this exactly as much as a normal review's schedule.
 *
 * The model: an item's SRS wait-clock only ticks outside a vacation. Two
 * cases fall out of that:
 *
 * 1. The wait was already in progress when the vacation began
 *    (`waitStartedAt <= vacationStartedAt`) — the whole vacation duration
 *    was frozen time, so the due date simply shifts by that duration:
 *    `nextReviewAt + (vacationEndedAt - vacationStartedAt)`.
 *    Spec 20's worked example: a review 3 days away stays "3 days away"
 *    after a 10-day vacation, i.e. `nextReviewAt + 10 days`.
 *
 * 2. The wait began *during* an active vacation (a lesson completed mid-
 *    vacation, spec 20's "Lessons During Vacation") — none of the elapsed
 *    time before the vacation counted toward this wait at all, and none of
 *    the time from learning it to vacation's end can count either (it's
 *    still inside the vacation). The full configured interval only starts
 *    counting once the vacation actually ends:
 *    `vacationEndedAt + (nextReviewAt - waitStartedAt)`.
 *    Spec 20's worked example: an item learned 5 days into a 10-day
 *    vacation with a 4-hour interval becomes due exactly 4 hours after
 *    the vacation ends, not 5 days 4 hours.
 *
 * An item already overdue *before* the vacation began (`nextReviewAt <
 * vacationStartedAt`) needs no special case — case 1's formula still
 * applies and produces a result at or before `vacationEndedAt`, which is
 * already in the past by the time this runs, so it reads as immediately
 * due without any extra branching.
 *
 * `waitStartedAt` is the item's current scheduling anchor —
 * `lastReviewedAt ?? learnedAt` for a normal item. (A future Fluent
 * maintenance anchor, once spec 20's Fluent Mode unit ships, extends this
 * the same way.)
 */
export type CalculateVacationAdjustedReviewInput = {
  nextReviewAt: Date;
  waitStartedAt: Date;
  vacationStartedAt: Date;
  vacationEndedAt: Date;
};

export function calculateVacationAdjustedReview({
  nextReviewAt,
  waitStartedAt,
  vacationStartedAt,
  vacationEndedAt,
}: CalculateVacationAdjustedReviewInput): Date {
  if (waitStartedAt.getTime() <= vacationStartedAt.getTime()) {
    const vacationDurationMs = vacationEndedAt.getTime() - vacationStartedAt.getTime();
    return new Date(nextReviewAt.getTime() + vacationDurationMs);
  }

  const intervalDurationMs = nextReviewAt.getTime() - waitStartedAt.getTime();
  return new Date(vacationEndedAt.getTime() + intervalDurationMs);
}
