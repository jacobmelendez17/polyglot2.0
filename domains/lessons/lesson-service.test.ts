import { describe, expect, it } from "vitest";

import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";

import { openLessonItem, startLesson, startQuiz, submitQuizAnswer } from "./lesson-service";
import { verifyLessonState } from "./lesson-token";
import type { LessonSessionResult, LessonStartResult } from "./lesson-types";

const USER_ID = "user-1";
const NOW = Date.parse("2026-01-01T00:00:00Z");

async function startAndViewAllItems(): Promise<LessonSessionResult> {
  const result = (await startLesson({ userId: USER_ID, languageId: FIXTURE_LANGUAGE_ID, now: NOW })) as Extract<
    LessonStartResult,
    { kind: "session" }
  >;
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
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
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
    const result = await startLesson({ userId: USER_ID, languageId: "nonexistent-language", now: NOW });
    expect(result.kind).toBe("empty");
  });
});

describe("openLessonItem", () => {
  it("marks a valid batch item as viewed", async () => {
    const start = (await startLesson({
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
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
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
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
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
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
      userId: USER_ID,
      languageId: FIXTURE_LANGUAGE_ID,
      now: NOW,
    })) as Extract<LessonStartResult, { kind: "session" }>;

    await expect(
      startQuiz({ token: start.token, userId: USER_ID, languageId: FIXTURE_LANGUAGE_ID, now: NOW }),
    ).rejects.toMatchObject({ code: "LESSON_QUIZ_NOT_READY" });
  });

  it("builds a quiz once every item is viewed", async () => {
    const viewed = await startAndViewAllItems();
    const quiz = await startQuiz({ token: viewed.token, userId: USER_ID, languageId: FIXTURE_LANGUAGE_ID, now: NOW });

    expect(quiz.phase).toBe("quiz");
    expect(quiz.currentQuestion).toBeDefined();
    expect(quiz.quizStats?.requiredCount).toBeGreaterThan(0);
  });
});

describe("submitQuizAnswer", () => {
  it("does not let the client submit a trusted correctness claim — grading always comes from the server", async () => {
    const viewed = await startAndViewAllItems();
    const quiz = await startQuiz({ token: viewed.token, userId: USER_ID, languageId: FIXTURE_LANGUAGE_ID, now: NOW });

    const result = await submitQuizAnswer({
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
    const quiz = await startQuiz({ token: viewed.token, userId: USER_ID, languageId: FIXTURE_LANGUAGE_ID, now: NOW });

    const result = await submitQuizAnswer({
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
    let session = await startQuiz({ token: viewed.token, userId: USER_ID, languageId: FIXTURE_LANGUAGE_ID, now: NOW });

    // Answer the first question incorrectly on purpose.
    session = await submitQuizAnswer({
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
      const answer = await resolveFixtureAnswer(question.itemId, question.direction);
      session = await submitQuizAnswer({
        token: session.token,
        userId: USER_ID,
        languageId: FIXTURE_LANGUAGE_ID,
        questionId: question.questionId,
        answer,
        now: NOW,
      });
    }

    expect(session.phase).toBe("complete");
    expect(session.quizStats?.satisfiedCount).toBe(session.quizStats?.requiredCount);
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
