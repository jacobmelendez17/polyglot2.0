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
      isThemeSelectionRequired(settings({ curriculumMode: "variety" }), [
        "theme-1",
        "theme-2",
      ]),
    ).toBe(false);
    expect(
      isThemeSelectionRequired(settings({ curriculumMode: "default_order" }), [
        "theme-1",
        "theme-2",
      ]),
    ).toBe(false);
    expect(isThemeSelectionRequired(null, ["theme-1", "theme-2"])).toBe(false);
  });

  // 2026-09-23 user decision: a learner who finishes a lesson and clicks
  // "Start lesson" again must be asked again, not silently continued in
  // whatever group they picked before — `domains/lessons/lesson-completion.ts`
  // clears `selectedVocabularyGroupId` back to `null` on completion, which
  // is what makes this fire; an *active* selection (just picked, lesson
  // not completed yet) must NOT re-trigger this, or picking a theme on the
  // "What next?" screen would loop back into asking again instead of
  // starting the lesson it just built.
  it("does not ask again for the lesson about to be built when a selection is still active", () => {
    const chosen = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "theme-1",
    });
    expect(isThemeSelectionRequired(chosen, ["theme-1", "theme-2"])).toBe(
      false,
    );
  });

  it("asks again once the active selection has been cleared (lesson completion) and more than one group is available", () => {
    const cleared = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: null,
    });
    expect(isThemeSelectionRequired(cleared, ["theme-1", "theme-2"])).toBe(
      true,
    );
  });

  it("asks again once the previously chosen group has nothing left, even without a completion clearing it first", () => {
    const stale = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "theme-finished",
    });
    expect(isThemeSelectionRequired(stale, ["theme-1", "theme-2"])).toBe(true);
  });

  it("asks when nothing has been picked yet and more than one group is available", () => {
    expect(
      isThemeSelectionRequired(settings({ curriculumMode: "choose_group" }), [
        "theme-1",
        "theme-2",
      ]),
    ).toBe(true);
  });

  // The one exception, verbatim from the same 2026-09-23 decision: "unless
  // there is only one group left" — a single remaining group is not a real
  // choice, so this stays out of the way regardless of whether it was ever
  // explicitly picked or is a previously-picked group that just now became
  // the only one left.
  it("does not ask when only one group has anything left", () => {
    expect(
      isThemeSelectionRequired(settings({ curriculumMode: "choose_group" }), [
        "theme-1",
      ]),
    ).toBe(false);

    const chosen = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "theme-1",
    });
    expect(isThemeSelectionRequired(chosen, ["theme-1"])).toBe(false);
  });

  it("does not ask when nothing is left in any group — the caller reads that as empty, not a choice", () => {
    expect(
      isThemeSelectionRequired(
        settings({ curriculumMode: "choose_group" }),
        [],
      ),
    ).toBe(false);
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
