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

describe("calculateNextReview — Default schedule (level 3+, spec 20 SRS Interval's 'Default Schedule Change')", () => {
  it("resolves each standard interval correctly", () => {
    expect(calculateNextReview({ stage: "beginner_1", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-01T04:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_2", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-01T08:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_3", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-02T00:00:00Z"), // 24 hours
    );
    expect(calculateNextReview({ stage: "beginner_4", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-03T00:00:00Z"), // 2 days
    );
    expect(calculateNextReview({ stage: "familiar_1", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-08T00:00:00Z"), // 7 days
    );
    expect(calculateNextReview({ stage: "familiar_2", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-15T00:00:00Z"), // 2 weeks
    );
    expect(calculateNextReview({ stage: "intermediate", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-01-29T00:00:00Z"), // 4 weeks (28 days) — duration-based, not calendar months
    );
  });

  it("Master resolves via real calendar-month arithmetic (3 calendar months, the new default — down from the old 4)", () => {
    expect(calculateNextReview({ stage: "master", level: 3, mode: "default", now: NOW })).toEqual(
      new Date("2026-04-01T00:00:00Z"),
    );
  });

  it("September 12 + 3 months = December 12 — spec 20's own worked example", () => {
    const sep12 = new Date("2026-09-12T00:00:00Z");
    expect(calculateNextReview({ stage: "master", level: 3, mode: "default", now: sep12 })).toEqual(
      new Date("2026-12-12T00:00:00Z"),
    );
  });

  it("Fluent resolves to null — no further review is scheduled", () => {
    expect(calculateNextReview({ stage: "fluent", level: 3, mode: "default", now: NOW })).toBeNull();
  });
});

describe("calculateNextReview — SRS Interval modes (spec 20's Level 3+ Standard Intervals table)", () => {
  it("Shortest", () => {
    expect(calculateNextReview({ stage: "beginner_3", level: 3, mode: "shortest", now: NOW })).toEqual(
      new Date("2026-01-01T12:00:00Z"), // 12 hours
    );
    expect(calculateNextReview({ stage: "familiar_1", level: 3, mode: "shortest", now: NOW })).toEqual(
      new Date("2026-01-06T00:00:00Z"), // 5 days
    );
    expect(calculateNextReview({ stage: "familiar_2", level: 3, mode: "shortest", now: NOW })).toEqual(
      new Date("2026-01-08T00:00:00Z"), // 1 week
    );
    expect(calculateNextReview({ stage: "intermediate", level: 3, mode: "shortest", now: NOW })).toEqual(
      new Date("2026-01-15T00:00:00Z"), // 2 weeks
    );
    expect(calculateNextReview({ stage: "master", level: 3, mode: "shortest", now: NOW })).toEqual(
      new Date("2026-03-01T00:00:00Z"), // 2 calendar months
    );
  });

  it("Shorter (Master coincides with Default at 3 months — a real quirk in the spec's own table)", () => {
    expect(calculateNextReview({ stage: "beginner_3", level: 3, mode: "shorter", now: NOW })).toEqual(
      new Date("2026-01-01T18:00:00Z"), // 18 hours
    );
    expect(calculateNextReview({ stage: "familiar_1", level: 3, mode: "shorter", now: NOW })).toEqual(
      new Date("2026-01-07T00:00:00Z"), // 6 days
    );
    expect(calculateNextReview({ stage: "familiar_2", level: 3, mode: "shorter", now: NOW })).toEqual(
      new Date("2026-01-11T12:00:00Z"), // 1.5 weeks = 10 days 12 hours
    );
    expect(calculateNextReview({ stage: "intermediate", level: 3, mode: "shorter", now: NOW })).toEqual(
      new Date("2026-01-22T00:00:00Z"), // 3 weeks
    );
    expect(calculateNextReview({ stage: "master", level: 3, mode: "shorter", now: NOW })).toEqual(
      new Date("2026-04-01T00:00:00Z"), // 3 calendar months, same as Default
    );
  });

  it("Longer", () => {
    expect(calculateNextReview({ stage: "beginner_3", level: 3, mode: "longer", now: NOW })).toEqual(
      new Date("2026-01-02T06:00:00Z"), // 30 hours
    );
    expect(calculateNextReview({ stage: "familiar_1", level: 3, mode: "longer", now: NOW })).toEqual(
      new Date("2026-01-09T00:00:00Z"), // 8 days
    );
    expect(calculateNextReview({ stage: "familiar_2", level: 3, mode: "longer", now: NOW })).toEqual(
      new Date("2026-01-18T12:00:00Z"), // 2.5 weeks = 17 days 12 hours
    );
    expect(calculateNextReview({ stage: "intermediate", level: 3, mode: "longer", now: NOW })).toEqual(
      new Date("2026-02-05T00:00:00Z"), // 5 weeks
    );
    expect(calculateNextReview({ stage: "master", level: 3, mode: "longer", now: NOW })).toEqual(
      new Date("2026-06-01T00:00:00Z"), // 5 calendar months
    );
  });

  it("Longest", () => {
    expect(calculateNextReview({ stage: "beginner_3", level: 3, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-02T12:00:00Z"), // 36 hours
    );
    expect(calculateNextReview({ stage: "familiar_1", level: 3, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-10T00:00:00Z"), // 9 days
    );
    expect(calculateNextReview({ stage: "familiar_2", level: 3, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-22T00:00:00Z"), // 3 weeks
    );
    expect(calculateNextReview({ stage: "intermediate", level: 3, mode: "longest", now: NOW })).toEqual(
      new Date("2026-02-12T00:00:00Z"), // 6 weeks
    );
    expect(calculateNextReview({ stage: "master", level: 3, mode: "longest", now: NOW })).toEqual(
      new Date("2026-07-01T00:00:00Z"), // 6 calendar months
    );
  });

  it("Beginner 1, 2, and 4 stay fixed regardless of mode — the spec's own 'these remain fixed' list", () => {
    const modes = ["shortest", "shorter", "default", "longer", "longest"] as const;
    for (const mode of modes) {
      expect(calculateNextReview({ stage: "beginner_1", level: 3, mode, now: NOW })).toEqual(new Date("2026-01-01T04:00:00Z"));
      expect(calculateNextReview({ stage: "beginner_2", level: 3, mode, now: NOW })).toEqual(new Date("2026-01-01T08:00:00Z"));
      expect(calculateNextReview({ stage: "beginner_4", level: 3, mode, now: NOW })).toEqual(new Date("2026-01-03T00:00:00Z"));
    }
  });
});

describe("calculateNextReview — calendar-month arithmetic at a month boundary", () => {
  it("documents native Date#setUTCMonth rollover for a month with no equivalent day, rather than an invented clamp — no spec example covers this case, so this is the honest, unmodified JS behavior, verified directly against Node rather than hand-computed", () => {
    // Master's only month-unit stage; Shortest = 2 calendar months.
    // Dec 31, 2026 + 2 months lands on "Feb 31, 2027", which doesn't exist
    // (2027 is not a leap year, so February has 28 days) — JS overflows the
    // excess 3 days into March.
    const dec31 = new Date("2026-12-31T00:00:00Z");
    expect(calculateNextReview({ stage: "master", level: 3, mode: "shortest", now: dec31 })).toEqual(
      new Date("2027-03-03T00:00:00Z"),
    );
  });
});

describe("calculateNextReview — accelerated schedule (levels 1-2)", () => {
  it("uses the accelerated Beginner intervals, unaffected by SRS Interval mode", () => {
    expect(calculateNextReview({ stage: "beginner_1", level: 1, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-01T02:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_2", level: 2, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-01T04:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_3", level: 1, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-01T08:00:00Z"),
    );
    expect(calculateNextReview({ stage: "beginner_4", level: 2, mode: "longest", now: NOW })).toEqual(
      new Date("2026-01-02T00:00:00Z"),
    );
  });

  it("falls back to the mode-selected standard schedule at Familiar 1 and beyond, even on an accelerated level", () => {
    const accelerated = calculateNextReview({ stage: "familiar_1", level: 1, mode: "default", now: NOW });
    const standard = calculateNextReview({ stage: "familiar_1", level: 5, mode: "default", now: NOW });
    expect(accelerated).toEqual(standard);
  });

  it("matches spec 20's own worked example: Level 1, Interval = Longest", () => {
    const start = NOW;
    const afterB1 = calculateNextReview({ stage: "beginner_1", level: 1, mode: "longest", now: start })!;
    expect(afterB1).toEqual(new Date("2026-01-01T02:00:00Z"));

    const afterB2 = calculateNextReview({ stage: "beginner_2", level: 1, mode: "longest", now: afterB1 })!;
    expect(afterB2).toEqual(new Date("2026-01-01T06:00:00Z"));

    const afterB3 = calculateNextReview({ stage: "beginner_3", level: 1, mode: "longest", now: afterB2 })!;
    expect(afterB3).toEqual(new Date("2026-01-01T14:00:00Z"));

    const afterB4 = calculateNextReview({ stage: "beginner_4", level: 1, mode: "longest", now: afterB3 })!;
    expect(afterB4).toEqual(new Date("2026-01-02T14:00:00Z"));

    // Familiar 1 onward uses the mode-selected standard schedule (Longest): 9 days, 3 weeks, 6 weeks, 6 months.
    const afterF1 = calculateNextReview({ stage: "familiar_1", level: 1, mode: "longest", now: afterB4 })!;
    expect(afterF1).toEqual(new Date("2026-01-11T14:00:00Z"));

    const afterF2 = calculateNextReview({ stage: "familiar_2", level: 1, mode: "longest", now: afterF1 })!;
    expect(afterF2).toEqual(new Date("2026-02-01T14:00:00Z"));

    const afterInt = calculateNextReview({ stage: "intermediate", level: 1, mode: "longest", now: afterF2 })!;
    expect(afterInt).toEqual(new Date("2026-03-15T14:00:00Z"));

    const afterMaster = calculateNextReview({ stage: "master", level: 1, mode: "longest", now: afterInt })!;
    expect(afterMaster).toEqual(new Date("2026-09-15T14:00:00Z"));
  });

  it("later levels (3+) use the standard schedule, not accelerated", () => {
    const level3 = calculateNextReview({ stage: "beginner_1", level: 3, mode: "default", now: NOW });
    const level1 = calculateNextReview({ stage: "beginner_1", level: 1, mode: "default", now: NOW });
    expect(level3).not.toEqual(level1);
  });
});

describe("calculateNextReview determinism", () => {
  it("depends only on the injected now, never the current wall clock", () => {
    const first = calculateNextReview({ stage: "beginner_1", level: 3, mode: "default", now: NOW });
    const second = calculateNextReview({ stage: "beginner_1", level: 3, mode: "default", now: NOW });
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
