import { describe, expect, it } from "vitest";

import { DEFAULT_REVIEW_TYPE, isClozeReviewType, isReviewType } from "./review-preference";

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
