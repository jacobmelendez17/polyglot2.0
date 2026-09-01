import { describe, expect, it } from "vitest";

import { rescheduleAfterIncorrect } from "./retry-scheduler";

const SPACING = 3;

describe("rescheduleAfterIncorrect", () => {
  it("does not place the failed question immediately next when enough others remain", () => {
    // Initial queue A B C D E; A answered incorrectly, popped off the front.
    const remaining = ["B", "C", "D", "E"];
    const result = rescheduleAfterIncorrect(remaining, "A", SPACING);
    expect(result[0]).not.toBe("A");
  });

  it("places at least 3 other questions before the retry when enough exist", () => {
    const remaining = ["B", "C", "D", "E"];
    const result = rescheduleAfterIncorrect(remaining, "A", SPACING);
    expect(result).toEqual(["B", "C", "D", "A", "E"]);
    expect(result.indexOf("A")).toBe(3);
  });

  it("may place the retry at the end", () => {
    const remaining = ["B", "C", "D"];
    const result = rescheduleAfterIncorrect(remaining, "A", SPACING);
    expect(result).toEqual(["B", "C", "D", "A"]);
  });

  it("supports multiple failed questions without forcing either to repeat immediately", () => {
    // A B C D E F; A incorrect (popped), reschedule.
    let queue = rescheduleAfterIncorrect(["B", "C", "D", "E", "F"], "A", SPACING);
    expect(queue).toEqual(["B", "C", "D", "A", "E", "F"]);

    // B answered correctly, removed from the front.
    queue = queue.slice(1);
    expect(queue[0]).toBe("C");

    // C answered incorrectly, popped and rescheduled.
    queue = rescheduleAfterIncorrect(queue.slice(1), "C", SPACING);
    expect(queue).toEqual(["D", "A", "E", "C", "F"]);
    expect(queue[0]).not.toBe("C");
  });

  it("handles a second failure of the same question", () => {
    // Only A (a retry, currently up again) and E remain unresolved.
    const rescheduled = rescheduleAfterIncorrect(["E"], "A", SPACING);
    expect(rescheduled).toEqual(["E", "A"]);
  });

  it("pushes the failed question as far toward the end as practical with too few remaining questions", () => {
    const result = rescheduleAfterIncorrect(["B"], "A", SPACING);
    expect(result).toEqual(["B", "A"]);
  });

  it("repeats a failed question immediately only when it is the only unresolved question remaining", () => {
    const result = rescheduleAfterIncorrect([], "A", SPACING);
    expect(result).toEqual(["A"]);
  });

  it("guarantees no starvation: every rescheduled question re-enters the queue at a bounded position", () => {
    const remaining = ["B", "C", "D", "E", "F", "G", "H"];
    const result = rescheduleAfterIncorrect(remaining, "A", SPACING);
    expect(result).toContain("A");
    expect(result.indexOf("A")).toBeLessThanOrEqual(remaining.length);
  });

  it("is deterministic", () => {
    const remaining = ["B", "C", "D", "E"];
    const first = rescheduleAfterIncorrect(remaining, "A", SPACING);
    const second = rescheduleAfterIncorrect(remaining, "A", SPACING);
    expect(first).toEqual(second);
  });
});
