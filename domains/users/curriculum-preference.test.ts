import { describe, expect, it } from "vitest";

import {
  isCurriculumChoiceRequired,
  isCurriculumMode,
  isGrammarPlacement,
  isThemeSelectionRequired,
  isValidLessonBatchSize,
} from "./curriculum-preference";
import type { LanguageSettings } from "./curriculum-preference";

function settings(overrides: Partial<LanguageSettings> = {}): LanguageSettings {
  return {
    userId: "user-1",
    languageId: "language-1",
    curriculumMode: "variety",
    selectedVocabularyGroupId: null,
    grammarPlacement: "no_preference",
    lessonBatchSize: 6,
    autoPronounceLessons: true,
    ...overrides,
  };
}

describe("isCurriculumMode", () => {
  it("accepts the three real modes", () => {
    expect(isCurriculumMode("default_order")).toBe(true);
    expect(isCurriculumMode("choose_group")).toBe(true);
    expect(isCurriculumMode("variety")).toBe(true);
  });

  it("rejects the retired spec-16 spellings and anything else", () => {
    expect(isCurriculumMode("theme")).toBe(false);
    expect(isCurriculumMode("random")).toBe(false);
    expect(isCurriculumMode("balanced")).toBe(false);
    expect(isCurriculumMode("DEFAULT_ORDER")).toBe(false);
    expect(isCurriculumMode("")).toBe(false);
    expect(isCurriculumMode(undefined)).toBe(false);
    expect(isCurriculumMode({ curriculumMode: "variety" })).toBe(false);
  });
});

describe("isGrammarPlacement", () => {
  it("accepts the three real placements", () => {
    expect(isGrammarPlacement("first")).toBe(true);
    expect(isGrammarPlacement("last")).toBe(true);
    expect(isGrammarPlacement("no_preference")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isGrammarPlacement("FIRST")).toBe(false);
    expect(isGrammarPlacement("")).toBe(false);
    expect(isGrammarPlacement(undefined)).toBe(false);
  });
});

describe("isCurriculumChoiceRequired", () => {
  it("requires a choice from a learner who has never made one", () => {
    expect(isCurriculumChoiceRequired({ isSandbox: false }, null)).toBe(true);
  });

  it("does not ask again once a mode is stored", () => {
    expect(isCurriculumChoiceRequired({ isSandbox: false }, settings())).toBe(
      false,
    );
  });

  it("never routes a sandbox persona onto the choice screen", () => {
    expect(isCurriculumChoiceRequired({ isSandbox: true }, null)).toBe(false);
  });
});

describe("isThemeSelectionRequired", () => {
  it("is irrelevant outside Choose Group as You Go", () => {
    expect(
      isThemeSelectionRequired(settings({ curriculumMode: "variety" }), []),
    ).toBe(false);
    expect(
      isThemeSelectionRequired(
        settings({ curriculumMode: "default_order" }),
        [],
      ),
    ).toBe(false);
    expect(isThemeSelectionRequired(null, ["theme-1"])).toBe(false);
  });

  it("asks when Choose Group as You Go has no group picked yet", () => {
    expect(
      isThemeSelectionRequired(settings({ curriculumMode: "choose_group" }), [
        "theme-1",
      ]),
    ).toBe(true);
  });

  it("asks again once the chosen group has nothing left in it", () => {
    const chosen = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "theme-finished",
    });
    expect(isThemeSelectionRequired(chosen, ["theme-1", "theme-2"])).toBe(true);
  });

  it("stays out of the way while the chosen group still has items", () => {
    const chosen = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "theme-1",
    });
    expect(isThemeSelectionRequired(chosen, ["theme-1", "theme-2"])).toBe(
      false,
    );
  });
});

describe("isValidLessonBatchSize", () => {
  it("accepts every integer from 3 through 15", () => {
    for (let size = 3; size <= 15; size++) {
      expect(isValidLessonBatchSize(size)).toBe(true);
    }
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(isValidLessonBatchSize(2)).toBe(false);
    expect(isValidLessonBatchSize(16)).toBe(false);
    expect(isValidLessonBatchSize(6.5)).toBe(false);
    expect(isValidLessonBatchSize("6")).toBe(false);
    expect(isValidLessonBatchSize(undefined)).toBe(false);
  });
});
