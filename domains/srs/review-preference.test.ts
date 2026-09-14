import { describe, expect, it } from "vitest";

import { DEFAULT_HINT_MODE, DEFAULT_HINT_ORDER, DEFAULT_REVIEW_TYPE, DEFAULT_UNDO_ACTION, isClozeReviewType, isHintMode, isHintOrder, isReviewType, isUndoAction } from "./review-preference";

describe("isReviewType", () => {
  it("accepts the three real review types", () => {
    expect(isReviewType("cloze_manual")).toBe(true);
    expect(isReviewType("cloze_flashcard")).toBe(true);
    expect(isReviewType("flashcard")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isReviewType("CLOZE_MANUAL")).toBe(false);
    expect(isReviewType("")).toBe(false);
    expect(isReviewType(undefined)).toBe(false);
  });
});

describe("isClozeReviewType", () => {
  it("is true for both Cloze variants", () => {
    expect(isClozeReviewType("cloze_manual")).toBe(true);
    expect(isClozeReviewType("cloze_flashcard")).toBe(true);
  });

  it("is false for Flashcard", () => {
    expect(isClozeReviewType("flashcard")).toBe(false);
  });
});

describe("DEFAULT_REVIEW_TYPE", () => {
  it("is Cloze (Manual), matching the spec's own pre-selected mockup", () => {
    expect(DEFAULT_REVIEW_TYPE).toBe("cloze_manual");
  });
});

describe("isHintOrder", () => {
  it("accepts the two real hint orders", () => {
    expect(isHintOrder("nuance_first")).toBe(true);
    expect(isHintOrder("translation_first")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHintOrder("NUANCE_FIRST")).toBe(false);
    expect(isHintOrder(undefined)).toBe(false);
  });
});

describe("isHintMode", () => {
  it("accepts the five real hint modes", () => {
    expect(isHintMode("hide")).toBe(true);
    expect(isHintMode("hint")).toBe(true);
    expect(isHintMode("show")).toBe(true);
    expect(isHintMode("more")).toBe(true);
    expect(isHintMode("always_show_nuance")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHintMode("HIDE")).toBe(false);
    expect(isHintMode(undefined)).toBe(false);
  });
});

describe("isUndoAction", () => {
  it("accepts the two real undo actions", () => {
    expect(isUndoAction("clear_last_character")).toBe(true);
    expect(isUndoAction("clear_all_characters")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isUndoAction("CLEAR_ALL")).toBe(false);
    expect(isUndoAction(undefined)).toBe(false);
  });
});

describe("spec 20's stated defaults", () => {
  it("Hint Order defaults to Nuance First", () => {
    expect(DEFAULT_HINT_ORDER).toBe("nuance_first");
  });

  it("Hint Mode defaults to Hint", () => {
    expect(DEFAULT_HINT_MODE).toBe("hint");
  });

  it("Undo Action defaults to Clear Last Character", () => {
    expect(DEFAULT_UNDO_ACTION).toBe("clear_last_character");
  });
});
