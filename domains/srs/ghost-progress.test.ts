import { describe, expect, it } from "vitest";

import { activateGhost, calculateGhostAnswerResult, calculateGhostMissOutcome } from "./ghost-progress";
import type { GhostStage } from "./ghost-progress";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("activateGhost", () => {
  it("schedules Ghost 1, 4 hours out (spec's own worked example)", () => {
    expect(activateGhost(NOW)).toEqual({ ghostStage: "ghost_1", nextReviewAt: new Date("2026-01-01T04:00:00Z") });
  });
});

describe("calculateGhostAnswerResult — correct answers advance through the fixed Ghost SRS", () => {
  const cases: Array<[GhostStage, GhostStage, string]> = [
    ["ghost_1", "ghost_2", "2026-01-01T12:00:00Z"],
    ["ghost_2", "ghost_3", "2026-01-02T00:00:00Z"],
    ["ghost_3", "ghost_4", "2026-01-03T00:00:00Z"],
  ];

  it.each(cases)("%s correct -> %s, scheduled per the fixed Ghost SRS", (stage, expectedStage, expectedNextReviewAt) => {
    const result = calculateGhostAnswerResult(stage, true, NOW);
    expect(result).toEqual({ kind: "advanced", ghostStage: expectedStage, nextReviewAt: new Date(expectedNextReviewAt) });
  });

  it("Ghost 4 correct -> completed (\"Ghost is gone\"), not a fifth stage", () => {
    expect(calculateGhostAnswerResult("ghost_4", true, NOW)).toEqual({ kind: "completed" });
  });
});

describe("calculateGhostAnswerResult — an incorrect Ghost answer always resets to Ghost 1", () => {
  const stages: GhostStage[] = ["ghost_1", "ghost_2", "ghost_3", "ghost_4"];

  it.each(stages)("%s incorrect -> reset to Ghost 1, 4 hours out", (stage) => {
    const result = calculateGhostAnswerResult(stage, false, NOW);
    expect(result).toEqual({ kind: "reset", ghostStage: "ghost_1", nextReviewAt: new Date("2026-01-01T04:00:00Z") });
  });
});

describe("calculateGhostMissOutcome (spec 20 Ghost Review Settings)", () => {
  it("Off never creates or records anything", () => {
    const result = calculateGhostMissOutcome({ mode: "off", existingMissCount: 0, existingGhostStage: null, now: NOW });
    expect(result).toEqual({ kind: "no_op" });
  });

  it("On activates a Ghost on the very first miss", () => {
    const result = calculateGhostMissOutcome({ mode: "on", existingMissCount: 0, existingGhostStage: null, now: NOW });
    expect(result).toEqual({ kind: "activate", missCount: 1, ghostStage: "ghost_1", nextReviewAt: new Date("2026-01-01T04:00:00Z") });
  });

  it("Minimal only records the first miss, no Ghost yet", () => {
    const result = calculateGhostMissOutcome({ mode: "minimal", existingMissCount: 0, existingGhostStage: null, now: NOW });
    expect(result).toEqual({ kind: "record_miss", missCount: 1 });
  });

  it("Minimal activates on the second miss of the same sentence", () => {
    const result = calculateGhostMissOutcome({ mode: "minimal", existingMissCount: 1, existingGhostStage: null, now: NOW });
    expect(result).toEqual({ kind: "activate", missCount: 2, ghostStage: "ghost_1", nextReviewAt: new Date("2026-01-01T04:00:00Z") });
  });

  it("a further normal-review miss of an already-active Ghost is a no-op — only answering the Ghost review itself changes it", () => {
    const onResult = calculateGhostMissOutcome({ mode: "on", existingMissCount: 1, existingGhostStage: "ghost_2", now: NOW });
    expect(onResult).toEqual({ kind: "no_op" });

    const minimalResult = calculateGhostMissOutcome({ mode: "minimal", existingMissCount: 3, existingGhostStage: "ghost_1", now: NOW });
    expect(minimalResult).toEqual({ kind: "no_op" });
  });

  it("switching from Minimal to On applies On's rule (any miss activates) even to a sentence already missed once under Minimal", () => {
    // The mode is read fresh at the moment of each miss, not frozen from when the row was first created.
    const result = calculateGhostMissOutcome({ mode: "on", existingMissCount: 1, existingGhostStage: null, now: NOW });
    expect(result).toEqual({ kind: "activate", missCount: 2, ghostStage: "ghost_1", nextReviewAt: new Date("2026-01-01T04:00:00Z") });
  });
});
