import { describe, expect, it } from "vitest";

import { calculateLeechStatus } from "./leech-status";

const SATISFIED_STAGE = "master" as const; // always well past a familiar_1 minimum in these tests unless noted otherwise

describe("calculateLeechStatus (spec 20 Leeches)", () => {
  it("is not a Leech with zero incorrect answers", () => {
    const result = calculateLeechStatus({
      incorrectCount: 0,
      currentCorrectStreak: 0,
      highestSrsStageReached: SATISFIED_STAGE,
      minimumLeechStage: "familiar_1",
    });
    expect(result).toBe(false);
  });

  it("a leechScore of exactly 1 is not a Leech — strictly greater than 1 is required", () => {
    const result = calculateLeechStatus({
      incorrectCount: 1,
      currentCorrectStreak: 1,
      highestSrsStageReached: SATISFIED_STAGE,
      minimumLeechStage: "familiar_1",
    });
    expect(result).toBe(false);
  });

  it("is a Leech once the score exceeds 1", () => {
    const result = calculateLeechStatus({
      incorrectCount: 2,
      currentCorrectStreak: 1,
      highestSrsStageReached: SATISFIED_STAGE,
      minimumLeechStage: "familiar_1",
    });
    expect(result).toBe(true);
  });

  it("protects against a zero correct streak the same way a streak of 1 would (effectiveCorrectStreak = max(streak, 1))", () => {
    const zeroStreak = calculateLeechStatus({
      incorrectCount: 2,
      currentCorrectStreak: 0,
      highestSrsStageReached: SATISFIED_STAGE,
      minimumLeechStage: "familiar_1",
    });
    const oneStreak = calculateLeechStatus({
      incorrectCount: 2,
      currentCorrectStreak: 1,
      highestSrsStageReached: SATISFIED_STAGE,
      minimumLeechStage: "familiar_1",
    });
    expect(zeroStreak).toBe(oneStreak);
    expect(zeroStreak).toBe(true);
  });

  it("a high correct streak suppresses Leech status even with many lifetime incorrect answers", () => {
    const result = calculateLeechStatus({
      incorrectCount: 10,
      currentCorrectStreak: 10,
      highestSrsStageReached: SATISFIED_STAGE,
      minimumLeechStage: "familiar_1",
    });
    // 10 / (10^1.5) ≈ 0.316, well under 1.
    expect(result).toBe(false);
  });

  it("is never a Leech until the minimum SRS stage has been reached at least once, even with a qualifying score", () => {
    const result = calculateLeechStatus({
      incorrectCount: 5,
      currentCorrectStreak: 1,
      highestSrsStageReached: "beginner_3",
      minimumLeechStage: "familiar_1",
    });
    expect(result).toBe(false);
  });

  it("uses the highest stage ever reached, not any notion of the item's current stage — satisfied once reached, even after later falling back", () => {
    // The spec's own example: reached Master, later fell to Beginner 4; Minimum Leech SRS = Familiar 1 — still satisfied.
    const result = calculateLeechStatus({
      incorrectCount: 5,
      currentCorrectStreak: 1,
      highestSrsStageReached: "master",
      minimumLeechStage: "familiar_1",
    });
    expect(result).toBe(true);
  });

  it("the minimum stage is satisfied exactly at that stage, not only strictly above it", () => {
    const result = calculateLeechStatus({
      incorrectCount: 5,
      currentCorrectStreak: 1,
      highestSrsStageReached: "familiar_1",
      minimumLeechStage: "familiar_1",
    });
    expect(result).toBe(true);
  });
});
