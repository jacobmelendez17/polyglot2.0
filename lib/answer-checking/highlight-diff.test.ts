import { describe, expect, it } from "vitest";

import { highlightAnswerDiff } from "./highlight-diff";

describe("highlightAnswerDiff", () => {
  it("marks a single wrong letter as incorrect, the rest correct", () => {
    const segments = highlightAnswerDiff("gata", "gato");
    expect(segments).toEqual([
      { text: "gat", correct: true },
      { text: "a", correct: false },
    ]);
  });

  it("is case-insensitive when matching, but preserves the user's original casing in the output", () => {
    const segments = highlightAnswerDiff("Gato", "gato");
    expect(segments).toEqual([{ text: "Gato", correct: true }]);
  });

  it("marks an extra trailing character as incorrect", () => {
    const segments = highlightAnswerDiff("gatoo", "gato");
    expect(segments).toEqual([
      { text: "gato", correct: true },
      { text: "o", correct: false },
    ]);
  });

  it("marks a missing-then-wrong case with alternating segments", () => {
    const segments = highlightAnswerDiff("xato", "gato");
    expect(segments).toEqual([
      { text: "x", correct: false },
      { text: "ato", correct: true },
    ]);
  });

  it("returns null rather than a misleading diff when the two answers are mostly unrelated", () => {
    expect(highlightAnswerDiff("perro", "gato")).toBeNull();
  });

  it("returns null for an empty user answer", () => {
    expect(highlightAnswerDiff("", "gato")).toBeNull();
  });

  it("distinguishes accented letters — never treats sí and si as the same character", () => {
    const segments = highlightAnswerDiff("si", "sí");
    expect(segments).toEqual([
      { text: "s", correct: true },
      { text: "i", correct: false },
    ]);
  });
});
