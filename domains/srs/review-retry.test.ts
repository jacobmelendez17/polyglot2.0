import { describe, expect, it } from "vitest";

import { rescheduleReviewAfterIncorrect } from "./review-retry";

describe("rescheduleReviewAfterIncorrect", () => {
  it("reinserts after the spacing minimum when enough questions remain", () => {
    // A B C D E, A just answered incorrectly, remaining queue is B C D E, spacing 3 -> B C D A E
    expect(rescheduleReviewAfterIncorrect(["B", "C", "D", "E"], "A", 3)).toEqual(["B", "C", "D", "A", "E"]);
  });

  it("pushes as late as practical when fewer than the spacing minimum remain", () => {
    expect(rescheduleReviewAfterIncorrect(["B"], "A", 3)).toEqual(["B", "A"]);
  });

  it("repeats immediately only when it was the sole unresolved question", () => {
    expect(rescheduleReviewAfterIncorrect([], "A", 3)).toEqual(["A"]);
  });

  it("does not create an unlimited penalty multiplier from repeated retries — a second failure reschedules the same way", () => {
    const afterFirst = rescheduleReviewAfterIncorrect(["B", "C", "D"], "A", 3);
    expect(afterFirst).toEqual(["B", "C", "D", "A"]);
    // A comes up again, fails again — same deterministic spacing rule applies, not an escalating one.
    const remaining = afterFirst.slice(1); // B was just shown/answered in between in a real session; simulate A's second failure directly
    expect(rescheduleReviewAfterIncorrect(remaining.filter((id) => id !== "A"), "A", 3)).toEqual(["C", "D", "A"]);
  });
});
