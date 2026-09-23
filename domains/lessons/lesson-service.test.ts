import { describe, expect, it } from "vitest";

import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";
import { fixtureCurriculumReader } from "@/domains/curriculum/curriculum-service";
import type { LearningItem, VocabularyItem } from "@/domains/curriculum";
import type { LanguageSettings } from "@/domains/users";

import {
  openLessonItem,
  startLesson,
  startQuiz,
  submitQuizAnswer,
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
    // An *active* selection (just picked, its lesson not completed yet)
    // must be honored immediately, not looped back into asking again —
    // otherwise picking a theme on the "What next?" screen and clicking
    // its own "Start lesson" would just re-show the same picker instead of
    // building the lesson it was for. This was a real regression caught
    // live: an earlier version of this fix asked on every `startLesson`
    // call whenever more than one group existed, with no regard for
    // whether a selection had just been made — the picker's own confirm
    // click reproduced exactly this "renders then stops" loop.
    it("does not ask again for the lesson about to be built when the chosen group still has items and is still the active selection", async () => {
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

      expect(result.kind).toBe("session");
      if (result.kind === "session") {
        expect(
          result.batch.every((item) =>
            item.itemId.startsWith("numbers-"),
          ),
        ).toBe(true);
      }
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
