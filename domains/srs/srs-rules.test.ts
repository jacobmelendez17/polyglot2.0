import { describe, expect, it } from "vitest";

import { calculateNextReview, getNextStage, getStageIndex, isReviewDue, isStageAtLeast } from "./srs-rules";
import { SRS_STAGE_ORDER } from "./srs-config";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("SRS stage ordering", () => {
  it("is explicit and does not rely on any external enum", () => {
    expect(SRS_STAGE_ORDER).toEqual([
      "beginner_1",
      "beginner_2",
      "beginner_3",
      "beginner_4",
      "familiar_1",
      "familiar_2",
      "intermediate",
      "master",
      "fluent",
    ]);
  });

  it("getStageIndex reflects that order", () => {
    expect(getStageIndex("beginner_1")).toBe(0);
    expect(getStageIndex("fluent")).toBe(8);
  });

  it("isStageAtLeast compares by position, not string value", () => {
    expect(isStageAtLeast("familiar_1", "familiar_1")).toBe(true);
    expect(isStageAtLeast("familiar_2", "familiar_1")).toBe(true);
    expect(isStageAtLeast("beginner_4", "familiar_1")).toBe(false);
  });
});

describe("getNextStage", () => {
  it("advances one stage at a time", () => {
    expect(getNextStage("beginner_1")).toBe("beginner_2");
    expect(getNextStage("familiar_2")).toBe("intermediate");
    expect(getNextStage("master")).toBe("fluent");
  });

  it("Fluent has the configured terminal behavior — it does not advance further", () => {
    expect(getNextStage("fluent")).toBe("fluent");
  });
});

describe("calculateNextReview — standard schedule (level 3+)", () => {
  it("resolves each standard interval correctly", () => {
    expect(calculateNextReview({ stage: "beginner_1", level: 3, now: NOW })).toEqual(
      new Date("2026-01-01T04:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_2", level: 3, now: NOW })).toEqual(
      new Date("2026-01-01T08:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_3", level: 3, now: NOW })).toEqual(
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_4", level: 3, now: NOW })).toEqual(
      new Date("2026-01-03T00:00:00Z"),
    );
    expect(calculateNextReview({ stage: "familiar_1", level: 3, now: NOW })).toEqual(
      new Date("2026-01-08T00:00:00Z"),
    );
    expect(calculateNextReview({ stage: "familiar_2", level: 3, now: NOW })).toEqual(
      new Date("2026-01-15T00:00:00Z"),
    );
  });

  it("Fluent resolves to null — no further review is scheduled", () => {
    expect(calculateNextReview({ stage: "fluent", level: 3, now: NOW })).toBeNull();
  });
});

describe("calculateNextReview — accelerated schedule (levels 1-2)", () => {
  it("uses the accelerated Beginner intervals", () => {
    expect(calculateNextReview({ stage: "beginner_1", level: 1, now: NOW })).toEqual(
      new Date("2026-01-01T02:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_2", level: 2, now: NOW })).toEqual(
      new Date("2026-01-01T04:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_3", level: 1, now: NOW })).toEqual(
      new Date("2026-01-01T08:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_4", level: 2, now: NOW })).toEqual(
      new Date("2026-01-02T00:00:00Z"),
    );
  });

  it("falls back to the standard schedule at Familiar 1 and beyond, even on an accelerated level", () => {
    const accelerated = calculateNextReview({ stage: "familiar_1", level: 1, now: NOW });
    const standard = calculateNextReview({ stage: "familiar_1", level: 5, now: NOW });
    expect(accelerated).toEqual(standard);
  });

  it("later levels (3+) use the standard schedule, not accelerated", () => {
    const level3 = calculateNextReview({ stage: "beginner_1", level: 3, now: NOW });
    const level1 = calculateNextReview({ stage: "beginner_1", level: 1, now: NOW });
    expect(level3).not.toEqual(level1);
  });
});

describe("calculateNextReview determinism", () => {
  it("depends only on the injected now, never the current wall clock", () => {
    const first = calculateNextReview({ stage: "beginner_1", level: 3, now: NOW });
    const second = calculateNextReview({ stage: "beginner_1", level: 3, now: NOW });
    expect(first).toEqual(second);
  });
});

describe("isReviewDue", () => {
  it("is due once now reaches nextReviewAt", () => {
    expect(isReviewDue({ nextReviewAt: NOW, now: NOW })).toBe(true);
    expect(isReviewDue({ nextReviewAt: new Date(NOW.getTime() + 1), now: NOW })).toBe(false);
    expect(isReviewDue({ nextReviewAt: new Date(NOW.getTime() - 1), now: NOW })).toBe(true);
  });

  it("is never due when there is no scheduled review (Fluent)", () => {
    expect(isReviewDue({ nextReviewAt: null, now: NOW })).toBe(false);
  });
});
