import { describe, expect, it } from "vitest";

import { isCurriculumChoiceRequired, isCurriculumMode, isThemeSelectionRequired } from "./curriculum-preference";
import type { LanguageSettings } from "./curriculum-preference";

function settings(overrides: Partial<LanguageSettings> = {}): LanguageSettings {
  return {
    userId: "user-1",
    languageId: "language-1",
    curriculumMode: "balanced",
    selectedVocabularyGroupId: null,
    ...overrides,
  };
}

describe("isCurriculumMode", () => {
  it("accepts the three real modes", () => {
    expect(isCurriculumMode("theme")).toBe(true);
    expect(isCurriculumMode("random")).toBe(true);
    expect(isCurriculumMode("balanced")).toBe(true);
  });

  it("rejects anything else, including the spec's uppercase spelling", () => {
    expect(isCurriculumMode("THEME")).toBe(false);
    expect(isCurriculumMode("")).toBe(false);
    expect(isCurriculumMode(undefined)).toBe(false);
    expect(isCurriculumMode({ curriculumMode: "theme" })).toBe(false);
  });
});

describe("isCurriculumChoiceRequired", () => {
  it("requires a choice from a learner who has never made one", () => {
    expect(isCurriculumChoiceRequired({ isSandbox: false }, null)).toBe(true);
  });

  it("does not ask again once a mode is stored", () => {
    expect(isCurriculumChoiceRequired({ isSandbox: false }, settings())).toBe(false);
  });

  it("never routes a sandbox persona onto the choice screen", () => {
    expect(isCurriculumChoiceRequired({ isSandbox: true }, null)).toBe(false);
  });
});

describe("isThemeSelectionRequired", () => {
  it("is irrelevant outside theme mode", () => {
    expect(isThemeSelectionRequired(settings({ curriculumMode: "balanced" }), [])).toBe(false);
    expect(isThemeSelectionRequired(settings({ curriculumMode: "random" }), [])).toBe(false);
    expect(isThemeSelectionRequired(null, ["theme-1"])).toBe(false);
  });

  it("asks when theme mode has no theme picked yet", () => {
    expect(isThemeSelectionRequired(settings({ curriculumMode: "theme" }), ["theme-1"])).toBe(true);
  });

  it("asks again once the chosen theme has nothing left in it", () => {
    const chosen = settings({ curriculumMode: "theme", selectedVocabularyGroupId: "theme-finished" });
    expect(isThemeSelectionRequired(chosen, ["theme-1", "theme-2"])).toBe(true);
  });

  it("stays out of the way while the chosen theme still has items", () => {
    const chosen = settings({ curriculumMode: "theme", selectedVocabularyGroupId: "theme-1" });
    expect(isThemeSelectionRequired(chosen, ["theme-1", "theme-2"])).toBe(false);
  });
});
