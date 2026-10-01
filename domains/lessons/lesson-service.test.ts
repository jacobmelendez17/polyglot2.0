import { describe, expect, it } from "vitest";

import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";
import { fixtureCurriculumReader } from "@/domains/curriculum/curriculum-service";
import type {
  GrammarItem,
  LearningItem,
  VocabularyItem,
} from "@/domains/curriculum";
import { GRAMMAR_THEME_ID } from "@/domains/users";
import type { LanguageSettings } from "@/domains/users";

import {
  openLessonItem,
  startLesson,
  startQuiz,
  submitQuizAnswer,
  toThemeChoices,
} from "./lesson-service";
import type { LessonCurriculumReader } from "./lesson-curriculum-reader";
import { verifyLessonState } from "./lesson-token";
import type { LessonSessionResult, LessonStartResult } from "./lesson-types";

const USER_ID = "user-1";
const NOW = Date.parse("2026-01-01T00:00:00Z");

const NUMBERS_THEME = { id: "theme-numbers", name: "Numbers", position: 1 };
const COLORS_THEME = { id: "theme-colors", name: "Colors", position: 2 };

function makeThemedItem(
  overrides: Partial<VocabularyItem> & { id: string },
): VocabularyItem {
  return {
    type: "vocabulary",
    languageId: FIXTURE_LANGUAGE_ID,
    levelNumber: 1,
    lessonPriority: 1,
    word: overrides.id,
    partOfSpeech: "noun",
    meanings: ["placeholder"],
    targetVariants: [],
    pronunciation: { guide: "placeholder" },
    examples: [],
    resources: [],
    ...overrides,
  };
}

function makeGrammarItem(
  overrides: Partial<GrammarItem> & { id: string },
): GrammarItem {
  return {
    type: "grammar",
    languageId: FIXTURE_LANGUAGE_ID,
    levelNumber: 1,
    lessonPriority: 1,
    structure: overrides.id,
    meaning: "placeholder",
    explanation: "placeholder",
    examples: [],
    resources: [],
    requiredQuestions: [
      { format: "translation", direction: "targetToEnglish" },
    ],
    ...overrides,
  };
}

/** A one-off `LessonCurriculumReader` over a fixed item list — for exercising Choose Group as You Go, which the shared `fixtureCurriculumReader`'s items have no themes to do. */
function themedCurriculumReader(items: LearningItem[]): LessonCurriculumReader {
  return {
    getEligibleLearningItems: async () => items,
    getLearningItemsByIds: async (ids) =>
      items.filter((item) => ids.includes(item.id)),
  };
}

function chooseGroupSettings(
  overrides: Partial<LanguageSettings> = {},
): LanguageSettings {
  return {
    userId: USER_ID,
    languageId: FIXTURE_LANGUAGE_ID,
    curriculumMode: "choose_group",
    selectedVocabularyGroupId: null,
    grammarPlacement: "no_preference",
    lessonBatchSize: 5,
    autoPronounceLessons: true,
    ...overrides,
  };
}

async function startAndViewAllItems(): Promise<LessonSessionResult> {
  const result = (await startLesson({
    curriculum: fixtureCurriculumReader,
    userId: USER_ID,
    languageId: FIXTURE_LANGUAGE_ID,
    languageCode: "es-MX",
    now: NOW,
  })) as Extract<LessonStartResult, { kind: "session" }>;
  expect(result.kind).toBe("session");

  let token = result.token;
  for (const batchItem of result.batch) {
    const opened = await openLessonItem({
      token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      itemId: batchItem.itemId,
      now: NOW,
    });
    token = opened.token;
  }

  return { ...result, token, viewedItemIds: result.batch.map((b) => b.itemId) };
}

describe("startLesson", () => {
  it("creates a signed ephemeral state containing only server-selected items", async () => {
    const result = (await startLesson({
      curriculum: fixtureCurriculumReader,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      languageCode: "es-MX",
      now: NOW,
    })) as Extract<LessonStartResult, { kind: "session" }>;

    expect(result.kind).toBe("session");
    expect(result.batch.length).toBeGreaterThan(0);
    expect(result.studyItems).toHaveLength(result.batch.length);

    const state = await verifyLessonState({
      token: result.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    });
    expect(state.phase).toBe("study");
    expect(state.viewedItemIds).toEqual([]);
  });

  it("produces no lesson for a user with no eligible items", async () => {
    const result = await startLesson({
      curriculum: fixtureCurriculumReader,
      userId: USER_ID,
      languageId: "nonexistent-language",
      languageCode: "es-MX",
      now: NOW,
    });
    expect(result.kind).toBe("empty");
  });

  describe("Choose Group as You Go", () => {
    // 2026-10-01: a merely *stored* selection no longer exempts a learner
    // from being asked again — see `isThemeSelectionRequired`'s docstring
    // for the full incident ("whenever I click start lesson it automatically
    // puts me in a lesson session," root-caused to a stored selection that
    // never cleared except on full completion). A plain `startLesson` call
    // with no `confirmedThemeId` must now ask again even though a previous
    // selection is sitting in settings.
    it("asks again on a plain restart even though a previous selection is still stored", async () => {
      const curriculum = themedCurriculumReader([
        ...Array.from({ length: 6 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          makeThemedItem({ id: `colors-${i}`, theme: COLORS_THEME }),
        ),
      ]);

      const result = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({
          selectedVocabularyGroupId: NUMBERS_THEME.id,
        }),
        now: NOW,
      });

      expect(result.kind).toBe("choose-theme");
    });

    // The replacement mechanism: `confirmedThemeId` bypasses the ask-again
    // check for exactly the one call the "What next?" screen's own confirm
    // click makes — otherwise picking a theme there would loop straight
    // back into the picker instead of building the lesson it was for (a
    // real regression an earlier version of *this* fix hit live: asking on
    // every `startLesson` call with no way to say "I just picked this one").
    it("honors an explicitly confirmed theme for this one call, regardless of what's stored", async () => {
      const curriculum = themedCurriculumReader([
        ...Array.from({ length: 6 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          makeThemedItem({ id: `colors-${i}`, theme: COLORS_THEME }),
        ),
      ]);

      const result = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({ selectedVocabularyGroupId: null }),
        confirmedThemeId: NUMBERS_THEME.id,
        now: NOW,
      });

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(
          result.batch.every((item) => item.itemId.startsWith("numbers-")),
        ).toBe(true);
      }
    });

    // Regression, found 2026-09-27 while adding the Grammar pseudo-theme:
    // the code used to overwrite `selectedThemeId` with `themes[0]`
    // whenever the ask-check returned false, without checking *why*. That's
    // correct when there's only one theme left (nothing to choose), but
    // wrong when it's false because a theme was just confirmed and that
    // confirmation doesn't happen to sort first. This test confirms with
    // the theme that sorts *second* (Colors), so a reintroduced bug would
    // silently switch it back to Numbers instead.
    it("honors a confirmed theme even when it isn't the first theme in curriculum order", async () => {
      const curriculum = themedCurriculumReader([
        ...Array.from({ length: 6 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          makeThemedItem({ id: `colors-${i}`, theme: COLORS_THEME }),
        ),
      ]);

      const result = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({ selectedVocabularyGroupId: null }),
        confirmedThemeId: COLORS_THEME.id,
        now: NOW,
      });

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(
          result.batch.every((item) => item.itemId.startsWith("colors-")),
        ).toBe(true);
      }
    });

    it("ignores a confirmed theme id that is no longer actually eligible, falling back to asking normally", async () => {
      const curriculum = themedCurriculumReader([
        ...Array.from({ length: 6 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          makeThemedItem({ id: `colors-${i}`, theme: COLORS_THEME }),
        ),
      ]);

      const result = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({ selectedVocabularyGroupId: null }),
        confirmedThemeId: "theme-does-not-exist",
        now: NOW,
      });

      expect(result.kind).toBe("choose-theme");
    });

    // 2026-09-23 user report, reproduced exactly: finishing a lesson out
    // of a group that still has items left, then starting another lesson,
    // must ask again rather than silently continuing in the same group.
    // `completeLesson` (domains/lessons/lesson-completion.ts) clears
    // `selectedVocabularyGroupId` back to `null` on completion — this test
    // simulates the state a *fresh* `startLesson` call sees right after
    // that clearing, since exercising the real completion transaction
    // needs a real database (covered separately, integration-level).
    it("asks again once the previous lesson's selection has been cleared, even though the group still has items left", async () => {
      const curriculum = themedCurriculumReader([
        ...Array.from({ length: 6 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          makeThemedItem({ id: `colors-${i}`, theme: COLORS_THEME }),
        ),
      ]);

      const result = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({ selectedVocabularyGroupId: null }),
        now: NOW,
      });

      expect(result.kind).toBe("choose-theme");
      if (result.kind === "choose-theme") {
        expect(result.themes.map((theme) => theme.id).sort()).toEqual(
          [NUMBERS_THEME.id, COLORS_THEME.id].sort(),
        );
      }
    });

    it("proceeds straight into the one remaining group without asking, whether or not it was ever picked", async () => {
      const curriculum = themedCurriculumReader(
        Array.from({ length: 3 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
      );

      // Never picked at all — still not asked, since there is only one option.
      const neverPicked = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({ selectedVocabularyGroupId: null }),
        now: NOW,
      });
      expect(neverPicked.kind).toBe("session");
      if (neverPicked.kind === "session") {
        expect(neverPicked.batch.length).toBeGreaterThan(0);
      }

      // A stale selection (some other, now-finished group) resolves to the
      // one real option instead, rather than reading as "nothing selected"
      // and failing to build a batch.
      const stalePick = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({
          selectedVocabularyGroupId: "theme-long-finished",
        }),
        now: NOW,
      });
      expect(stalePick.kind).toBe("session");
      if (stalePick.kind === "session") {
        expect(stalePick.batch.length).toBeGreaterThan(0);
      }
    });

    it("still reports empty, not a choice, once every group is finished", async () => {
      const result = await startLesson({
        curriculum: themedCurriculumReader([]),
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({
          selectedVocabularyGroupId: NUMBERS_THEME.id,
        }),
        now: NOW,
      });
      expect(result.kind).toBe("empty");
    });

    it("builds a grammar-only batch when the Grammar pseudo-theme is the confirmed selection", async () => {
      const curriculum = themedCurriculumReader([
        ...Array.from({ length: 6 }, (_, i) =>
          makeThemedItem({ id: `numbers-${i}`, theme: NUMBERS_THEME }),
        ),
        makeGrammarItem({ id: "grammar-0" }),
        makeGrammarItem({ id: "grammar-1" }),
      ]);

      const result = await startLesson({
        curriculum,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        languageCode: "es-MX",
        settings: chooseGroupSettings({ selectedVocabularyGroupId: null }),
        confirmedThemeId: GRAMMAR_THEME_ID,
        now: NOW,
      });

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(result.batch.map((item) => item.itemId).sort()).toEqual(
          ["grammar-0", "grammar-1"].sort(),
        );
      }
    });
  });
});

describe("toThemeChoices", () => {
  it("appends a Grammar choice after the vocabulary groups when grammar remains", () => {
    const choices = toThemeChoices([
      makeThemedItem({ id: "numbers-0", theme: NUMBERS_THEME }),
      makeGrammarItem({ id: "grammar-0" }),
      makeGrammarItem({ id: "grammar-1" }),
    ]);
    expect(choices.map((choice) => ({ id: choice.id, kind: choice.kind }))).toEqual([
      { id: NUMBERS_THEME.id, kind: "vocabulary" },
      { id: GRAMMAR_THEME_ID, kind: "grammar" },
    ]);
    const grammarChoice = choices.find((choice) => choice.id === GRAMMAR_THEME_ID);
    expect(grammarChoice?.remainingCount).toBe(2);
  });

  it("omits Grammar entirely once no grammar remains", () => {
    const choices = toThemeChoices([
      makeThemedItem({ id: "numbers-0", theme: NUMBERS_THEME }),
    ]);
    expect(choices.some((choice) => choice.id === GRAMMAR_THEME_ID)).toBe(
      false,
    );
  });

  it("offers only Grammar when no vocabulary remains", () => {
    const choices = toThemeChoices([makeGrammarItem({ id: "grammar-0" })]);
    expect(choices).toEqual([
      { id: GRAMMAR_THEME_ID, name: "Grammar", remainingCount: 1, kind: "grammar" },
    ]);
  });
});

describe("openLessonItem", () => {
  it("marks a valid batch item as viewed", async () => {
    const start = (await startLesson({
      curriculum: fixtureCurriculumReader,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      languageCode: "es-MX",
      now: NOW,
    })) as Extract<LessonStartResult, { kind: "session" }>;
    const itemId = start.batch[0].itemId;

    const opened = await openLessonItem({
      token: start.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      itemId,
      now: NOW,
    });

    expect(opened.viewedItemIds).toContain(itemId);
  });

  it("rejects opening an item outside the batch", async () => {
    const start = (await startLesson({
      curriculum: fixtureCurriculumReader,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      languageCode: "es-MX",
      now: NOW,
    })) as Extract<LessonStartResult, { kind: "session" }>;

    await expect(
      openLessonItem({
        token: start.token,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        itemId: "not-in-batch",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
  });

  it("creates no SRS progress signal — the resulting state has no quiz field", async () => {
    const start = (await startLesson({
      curriculum: fixtureCurriculumReader,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      languageCode: "es-MX",
      now: NOW,
    })) as Extract<LessonStartResult, { kind: "session" }>;
    const opened = await openLessonItem({
      token: start.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      itemId: start.batch[0].itemId,
      now: NOW,
    });
    const state = await verifyLessonState({
      token: opened.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    });
    expect(state.quiz).toBeUndefined();
  });
});

describe("startQuiz", () => {
  it("stays locked until every lesson item has been viewed", async () => {
    const start = (await startLesson({
      curriculum: fixtureCurriculumReader,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      languageCode: "es-MX",
      now: NOW,
    })) as Extract<LessonStartResult, { kind: "session" }>;

    await expect(
      startQuiz({
        curriculum: fixtureCurriculumReader,
        token: start.token,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "LESSON_QUIZ_NOT_READY" });
  });

  it("builds a quiz once every item is viewed", async () => {
    const viewed = await startAndViewAllItems();
    const quiz = await startQuiz({
      curriculum: fixtureCurriculumReader,
      token: viewed.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    });

    expect(quiz.phase).toBe("quiz");
    expect(quiz.currentQuestion).toBeDefined();
    expect(quiz.quizStats?.requiredCount).toBeGreaterThan(0);
  });
});

describe("submitQuizAnswer", () => {
  it("does not let the client submit a trusted correctness claim — grading always comes from the server", async () => {
    const viewed = await startAndViewAllItems();
    const quiz = await startQuiz({
      curriculum: fixtureCurriculumReader,
      token: viewed.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    });

    const result = await submitQuizAnswer({
      curriculum: fixtureCurriculumReader,
      token: quiz.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      questionId: quiz.currentQuestion!.questionId,
      answer: "definitely wrong answer that will never match",
      now: NOW,
    });

    expect(result.feedback?.kind).toBe("incorrect");
  });

  it("does not record an empty submission as an attempt", async () => {
    const viewed = await startAndViewAllItems();
    const quiz = await startQuiz({
      curriculum: fixtureCurriculumReader,
      token: viewed.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    });

    const result = await submitQuizAnswer({
      curriculum: fixtureCurriculumReader,
      token: quiz.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      questionId: quiz.currentQuestion!.questionId,
      answer: "   ",
      now: NOW,
    });

    expect(result.feedback?.kind).toBe("empty");
    expect(result.quizStats?.attempts).toBe(0);
  });

  it("keeps a pending retry from letting the lesson complete, and eventually resolves it", async () => {
    const viewed = await startAndViewAllItems();
    let session = await startQuiz({
      curriculum: fixtureCurriculumReader,
      token: viewed.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    });

    // Answer the first question incorrectly on purpose.
    session = await submitQuizAnswer({
      curriculum: fixtureCurriculumReader,
      token: session.token,
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      questionId: session.currentQuestion!.questionId,
      answer: "zzz-never-correct-zzz",
      now: NOW,
    });
    expect(session.phase).toBe("quiz");
    expect(session.feedback?.kind).toBe("incorrect");

    // Answer every other question correctly using the server-provided expected answer,
    // until only the failed retry remains.
    let guard = 0;
    while (session.phase === "quiz" && guard < 100) {
      guard++;
      const question = session.currentQuestion!;
      // Look up the correct answer via a deliberately-wrong probe first is not possible
      // (server never reveals accepted answers ahead of grading), so resolve using the
      // canonical fixture facts for this question's item/direction.
      const answer = await resolveFixtureAnswer(
        question.itemId,
        question.direction,
      );
      session = await submitQuizAnswer({
        curriculum: fixtureCurriculumReader,
        token: session.token,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        questionId: question.questionId,
        answer,
        now: NOW,
      });
    }

    expect(session.phase).toBe("complete");
    expect(session.quizStats?.satisfiedCount).toBe(
      session.quizStats?.requiredCount,
    );
  });
});

async function resolveFixtureAnswer(
  itemId: string,
  direction: "targetToEnglish" | "englishToTarget",
): Promise<string> {
  const { getLearningItemsByIds } = await import("@/domains/curriculum");
  const { getQuestionAnswerSpec } = await import("./quiz-requirements");
  const [item] = await getLearningItemsByIds([itemId]);
  const spec = getQuestionAnswerSpec(item, direction);
  return spec.acceptedAnswers[0];
}
