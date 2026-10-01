import { describe, expect, it } from "vitest";

import {
  GRAMMAR_THEME_ID,
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

  // 2026-10-01 user report, root-caused: a stored `selectedVocabularyGroupId`
  // used to exempt a learner from being asked again, on the theory that it
  // represented an in-progress lesson attempt "honored for the one lesson it
  // was made for." That theory didn't hold — a lesson session is an
  // ephemeral, client-held token discarded on exit or refresh, so nothing
  // about leaving mid-study ever cleared this field, and a learner who
  // picked a theme once and then exited before completing would have every
  // later "Start lesson" click silently resume it, forever, with the picker
  // never reappearing ("whenever I click start lesson it automatically puts
  // me in a lesson session"). This function no longer considers the stored
  // selection at all; see its docstring for the full incident and for where
  // the "just confirmed, don't ask again for *this* call" case now actually
  // lives (`startLesson`'s `confirmedThemeId`, not here).
  it("asks again even when a previous selection is still stored", () => {
    const chosen = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "theme-1",
    });
    expect(isThemeSelectionRequired(chosen, ["theme-1", "theme-2"])).toBe(
      true,
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

  // GRAMMAR_THEME_ID (2026-09-27) is just one more value this function's
  // `availableThemeIds` list can contain — it needs no dedicated handling
  // here to behave correctly, which these tests confirm rather than assume.
  it("asks again even with a stored active Grammar selection, same as a stored group selection", () => {
    const chosenGrammar = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: GRAMMAR_THEME_ID,
    });
    expect(
      isThemeSelectionRequired(chosenGrammar, ["theme-1", GRAMMAR_THEME_ID]),
    ).toBe(true);
  });

  it("asks again once Grammar is no longer offered (all grammar learned), same as a finished group", () => {
    const chosenGrammar = settings({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: GRAMMAR_THEME_ID,
    });
    expect(isThemeSelectionRequired(chosenGrammar, ["theme-1", "theme-2"])).toBe(
      true,
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
