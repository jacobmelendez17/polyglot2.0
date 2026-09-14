import { describe, expect, it } from "vitest";

import { calculateVacationAdjustedReview } from "./vacation-scheduling";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe("calculateVacationAdjustedReview", () => {
  it("shifts a review that was already waiting by the full vacation duration (spec 20's '3 days away' example)", () => {
    const vacationStartedAt = new Date("2026-01-10T00:00:00Z");
    const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);
    const waitStartedAt = new Date("2026-01-05T00:00:00Z"); // started before the vacation
    const nextReviewAt = new Date(vacationStartedAt.getTime() + 3 * DAY_MS); // "3 days away" when vacation starts

    const result = calculateVacationAdjustedReview({ nextReviewAt, waitStartedAt, vacationStartedAt, vacationEndedAt });

    expect(result).toEqual(new Date(vacationEndedAt.getTime() + 3 * DAY_MS));
  });

  it("resumes the full configured interval from vacation's end for an item learned mid-vacation (spec 20's '4 hours after vacation ends' example)", () => {
    const vacationStartedAt = new Date("2026-01-10T00:00:00Z");
    const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);
    const waitStartedAt = new Date(vacationStartedAt.getTime() + 5 * DAY_MS); // learned 5 days into vacation
    const nextReviewAt = new Date(waitStartedAt.getTime() + 4 * HOUR_MS); // normal 4-hour Beginner 1 interval

    const result = calculateVacationAdjustedReview({ nextReviewAt, waitStartedAt, vacationStartedAt, vacationEndedAt });

    expect(result).toEqual(new Date(vacationEndedAt.getTime() + 4 * HOUR_MS));
  });

  it("resolves an already-overdue item to a time at or before vacation's end, reading as immediately due", () => {
    const vacationStartedAt = new Date("2026-01-10T00:00:00Z");
    const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);
    const waitStartedAt = new Date(vacationStartedAt.getTime() - 5 * DAY_MS);
    const nextReviewAt = new Date(vacationStartedAt.getTime() - 2 * DAY_MS); // already 2 days overdue at vacation start

    const result = calculateVacationAdjustedReview({ nextReviewAt, waitStartedAt, vacationStartedAt, vacationEndedAt });

    expect(result.getTime()).toBeLessThanOrEqual(vacationEndedAt.getTime());
  });

  it("a wait extending well beyond the vacation still shifts by the full vacation duration", () => {
    const vacationStartedAt = new Date("2026-01-10T00:00:00Z");
    const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);
    const waitStartedAt = new Date(vacationStartedAt.getTime() - 5 * DAY_MS);
    const nextReviewAt = new Date(waitStartedAt.getTime() + 60 * DAY_MS); // a long Master-stage interval

    const result = calculateVacationAdjustedReview({ nextReviewAt, waitStartedAt, vacationStartedAt, vacationEndedAt });

    expect(result).toEqual(new Date(nextReviewAt.getTime() + 10 * DAY_MS));
  });

  it("a wait started exactly at vacation start is treated as pre-existing (boundary case)", () => {
    const vacationStartedAt = new Date("2026-01-10T00:00:00Z");
    const vacationEndedAt = new Date(vacationStartedAt.getTime() + 10 * DAY_MS);
    const waitStartedAt = vacationStartedAt;
    const nextReviewAt = new Date(vacationStartedAt.getTime() + 3 * DAY_MS);

    const result = calculateVacationAdjustedReview({ nextReviewAt, waitStartedAt, vacationStartedAt, vacationEndedAt });

    expect(result).toEqual(new Date(vacationEndedAt.getTime() + 3 * DAY_MS));
  });

  it("a zero-length vacation makes no adjustment", () => {
    const vacationStartedAt = new Date("2026-01-10T00:00:00Z");
    const vacationEndedAt = vacationStartedAt;
    const waitStartedAt = new Date(vacationStartedAt.getTime() - DAY_MS);
    const nextReviewAt = new Date(vacationStartedAt.getTime() + DAY_MS);

    const result = calculateVacationAdjustedReview({ nextReviewAt, waitStartedAt, vacationStartedAt, vacationEndedAt });

    expect(result).toEqual(nextReviewAt);
  });
});
