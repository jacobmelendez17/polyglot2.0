import { describe, expect, it } from "vitest";

import { calculateReviewStageResult } from "./review-result";
import type { SrsStrictness } from "./review-preference";
import type { SrsStage } from "./srs-types";

const STRICTNESS: SrsStrictness = "one_stage"; // irrelevant to the all-correct path; picked once for readability there.

describe("calculateReviewStageResult — all-correct advancement (unaffected by SRS Strictness)", () => {
  it("advances exactly one stage when nothing was incorrect", () => {
    expect(
      calculateReviewStageResult({ stage: "beginner_1", hadIncorrectRequiredAnswer: false, srsStrictness: STRICTNESS }),
    ).toEqual({ stage: "beginner_2", result: "advanced", reachedFluent: false });

    expect(
      calculateReviewStageResult({ stage: "familiar_2", hadIncorrectRequiredAnswer: false, srsStrictness: STRICTNESS }),
    ).toEqual({ stage: "intermediate", result: "advanced", reachedFluent: false });
  });

  it("Fluent completion — advancing from Master reaches Fluent and reports it", () => {
    expect(
      calculateReviewStageResult({ stage: "master", hadIncorrectRequiredAnswer: false, srsStrictness: STRICTNESS }),
    ).toEqual({ stage: "fluent", result: "advanced", reachedFluent: true });
  });

  it("advancing from a stage that is not about to reach Fluent does not report it", () => {
    expect(
      calculateReviewStageResult({ stage: "intermediate", hadIncorrectRequiredAnswer: false, srsStrictness: STRICTNESS })
        .reachedFluent,
    ).toBe(false);
  });

  it("correct advancement is identical no matter which strictness is configured", () => {
    const strictnesses: SrsStrictness[] = ["one_stage", "two_stages", "three_stages", "half", "full"];
    for (const srsStrictness of strictnesses) {
      const result = calculateReviewStageResult({ stage: "familiar_1", hadIncorrectRequiredAnswer: false, srsStrictness });
      expect(result).toEqual({ stage: "familiar_2", result: "advanced", reachedFluent: false });
    }
  });
});

describe("calculateReviewStageResult — SRS Strictness: 1 Stage (the new Polyglot-wide default)", () => {
  const cases: Array<[SrsStage, SrsStage]> = [
    ["beginner_1", "beginner_1"], // clamped
    ["beginner_2", "beginner_1"],
    ["beginner_3", "beginner_2"],
    ["beginner_4", "beginner_3"],
    ["familiar_1", "beginner_4"], // the old model penalized this 2 stages to beginner_3 — must not anymore
    ["familiar_2", "familiar_1"],
    ["intermediate", "familiar_2"],
    ["master", "intermediate"],
    ["fluent", "master"],
  ];

  it.each(cases)("%s + incorrect -> %s", (stage, expected) => {
    const result = calculateReviewStageResult({ stage, hadIncorrectRequiredAnswer: true, srsStrictness: "one_stage" });
    expect(result).toEqual({ stage: expected, result: "penalized", reachedFluent: false });
  });

  it("both required vocabulary directions incorrect still costs exactly one stage — hadIncorrectRequiredAnswer is a boolean, not a count", () => {
    const result = calculateReviewStageResult({ stage: "beginner_3", hadIncorrectRequiredAnswer: true, srsStrictness: "one_stage" });
    expect(result.stage).toBe("beginner_2");
  });
});

describe("calculateReviewStageResult — SRS Strictness: 2 Stages", () => {
  const cases: Array<[SrsStage, SrsStage]> = [
    ["beginner_1", "beginner_1"],
    ["beginner_2", "beginner_1"],
    ["beginner_3", "beginner_1"],
    ["beginner_4", "beginner_2"],
    ["familiar_1", "beginner_3"],
    ["fluent", "intermediate"],
  ];

  it.each(cases)("%s + incorrect -> %s", (stage, expected) => {
    const result = calculateReviewStageResult({ stage, hadIncorrectRequiredAnswer: true, srsStrictness: "two_stages" });
    expect(result).toEqual({ stage: expected, result: "penalized", reachedFluent: false });
  });
});

describe("calculateReviewStageResult — SRS Strictness: 3 Stages", () => {
  const cases: Array<[SrsStage, SrsStage]> = [
    ["beginner_1", "beginner_1"],
    ["beginner_3", "beginner_1"],
    ["beginner_4", "beginner_1"],
    ["familiar_1", "beginner_2"],
    ["fluent", "familiar_2"],
  ];

  it.each(cases)("%s + incorrect -> %s", (stage, expected) => {
    const result = calculateReviewStageResult({ stage, hadIncorrectRequiredAnswer: true, srsStrictness: "three_stages" });
    expect(result).toEqual({ stage: expected, result: "penalized", reachedFluent: false });
  });
});

describe("calculateReviewStageResult — SRS Strictness: Half (spec's own worked examples)", () => {
  it("Master (position 8) -> floor(8/2) = 4 -> Beginner 4", () => {
    const result = calculateReviewStageResult({ stage: "master", hadIncorrectRequiredAnswer: true, srsStrictness: "half" });
    expect(result.stage).toBe("beginner_4");
  });

  it("Familiar 1 (position 5) -> floor(5/2) = 2 -> Beginner 2", () => {
    const result = calculateReviewStageResult({ stage: "familiar_1", hadIncorrectRequiredAnswer: true, srsStrictness: "half" });
    expect(result.stage).toBe("beginner_2");
  });

  const cases: Array<[SrsStage, SrsStage]> = [
    ["beginner_1", "beginner_1"], // position 1 -> floor(1/2)=0 -> clamped
    ["beginner_2", "beginner_1"], // position 2 -> floor(2/2)=1 -> Beginner 1
    ["beginner_3", "beginner_1"], // position 3 -> floor(3/2)=1 -> Beginner 1
    ["beginner_4", "beginner_2"], // position 4 -> floor(4/2)=2 -> Beginner 2
    ["familiar_2", "beginner_3"], // position 6 -> floor(6/2)=3 -> Beginner 3
    ["intermediate", "beginner_3"], // position 7 -> floor(7/2)=3 -> Beginner 3
    ["fluent", "beginner_4"], // position 9 -> floor(9/2)=4 -> Beginner 4
  ];

  it.each(cases)("%s + incorrect -> %s", (stage, expected) => {
    const result = calculateReviewStageResult({ stage, hadIncorrectRequiredAnswer: true, srsStrictness: "half" });
    expect(result).toEqual({ stage: expected, result: "penalized", reachedFluent: false });
  });
});

describe("calculateReviewStageResult — SRS Strictness: Full", () => {
  const stages: SrsStage[] = ["beginner_1", "beginner_4", "familiar_1", "familiar_2", "intermediate", "master", "fluent"];

  it.each(stages)("%s + incorrect -> Beginner 1, always, never Beginner 0", (stage) => {
    const result = calculateReviewStageResult({ stage, hadIncorrectRequiredAnswer: true, srsStrictness: "full" });
    expect(result).toEqual({ stage: "beginner_1", result: "penalized", reachedFluent: false });
  });
});

describe("calculateReviewStageResult — an incorrect item does not also advance before the penalty is applied", () => {
  it("under every strictness level", () => {
    const strictnesses: SrsStrictness[] = ["one_stage", "two_stages", "three_stages", "half", "full"];
    for (const srsStrictness of strictnesses) {
      const result = calculateReviewStageResult({ stage: "intermediate", hadIncorrectRequiredAnswer: true, srsStrictness });
      expect(result.result).toBe("penalized");
      expect(result.stage).not.toBe("master");
    }
  });
});
