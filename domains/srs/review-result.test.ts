import { describe, expect, it } from "vitest";

import { calculateReviewStageResult } from "./review-result";
import type { SrsStage } from "./srs-types";

describe("calculateReviewStageResult — all-correct advancement", () => {
  it("advances exactly one stage when nothing was incorrect", () => {
    expect(
      calculateReviewStageResult({ stage: "beginner_1", hadIncorrectRequiredAnswer: false }),
    ).toEqual({ stage: "beginner_2", result: "advanced", reachedFluent: false });

    expect(
      calculateReviewStageResult({ stage: "familiar_2", hadIncorrectRequiredAnswer: false }),
    ).toEqual({ stage: "intermediate", result: "advanced", reachedFluent: false });
  });

  it("Fluent completion — advancing from Master reaches Fluent and reports it", () => {
    expect(calculateReviewStageResult({ stage: "master", hadIncorrectRequiredAnswer: false })).toEqual({
      stage: "fluent",
      result: "advanced",
      reachedFluent: true,
    });
  });

  it("advancing from a stage that is not about to reach Fluent does not report it", () => {
    expect(
      calculateReviewStageResult({ stage: "intermediate", hadIncorrectRequiredAnswer: false }).reachedFluent,
    ).toBe(false);
  });
});

describe("calculateReviewStageResult — Beginner tier penalty (flat 1 stage)", () => {
  const cases: Array<[SrsStage, SrsStage]> = [
    ["beginner_1", "beginner_1"],
    ["beginner_2", "beginner_1"],
    ["beginner_3", "beginner_2"],
    ["beginner_4", "beginner_3"],
  ];

  it.each(cases)("%s + incorrect -> %s", (stage, expected) => {
    const result = calculateReviewStageResult({ stage, hadIncorrectRequiredAnswer: true });
    expect(result).toEqual({ stage: expected, result: "penalized", reachedFluent: false });
  });

  it("floors at Beginner 1 and never goes below it", () => {
    const result = calculateReviewStageResult({ stage: "beginner_1", hadIncorrectRequiredAnswer: true });
    expect(result.stage).toBe("beginner_1");
  });

  it("both required vocabulary directions incorrect still costs exactly one stage", () => {
    // hadIncorrectRequiredAnswer is a boolean, not a count — this is what
    // "both directions incorrect" collapses to by the time it reaches this
    // function, so the assertion is identical to the single-incorrect case.
    const result = calculateReviewStageResult({ stage: "beginner_3", hadIncorrectRequiredAnswer: true });
    expect(result.stage).toBe("beginner_2");
  });
});

describe("calculateReviewStageResult — Familiar+ penalty (factor 2, capped at one adjustment per item)", () => {
  it("penalizes exactly 2 stages regardless of how many required directions/types were wrong", () => {
    const result = calculateReviewStageResult({ stage: "familiar_1", hadIncorrectRequiredAnswer: true });
    expect(result).toEqual({ stage: "beginner_3", result: "penalized", reachedFluent: false });
  });

  it("familiar_2 + incorrect -> beginner_4 (2 stages back)", () => {
    const result = calculateReviewStageResult({ stage: "familiar_2", hadIncorrectRequiredAnswer: true });
    expect(result.stage).toBe("beginner_4");
  });

  it("master + incorrect -> familiar_2", () => {
    const result = calculateReviewStageResult({ stage: "master", hadIncorrectRequiredAnswer: true });
    expect(result.stage).toBe("familiar_2");
  });

  it("an incorrect item does not also advance before the penalty is applied", () => {
    const result = calculateReviewStageResult({ stage: "intermediate", hadIncorrectRequiredAnswer: true });
    expect(result.result).toBe("penalized");
    expect(result.stage).not.toBe("master");
  });
});
