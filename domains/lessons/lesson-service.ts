import { getEligibleLearningItems, getLearningItemsByIds } from "@/domains/curriculum";
import type { LearningItem } from "@/domains/curriculum";
import { checkAnswer } from "@/lib/answer-checking";
import { LessonError } from "@/lib/errors/lesson-errors";

import { selectLessonBatch, toLessonBatchItems } from "./lesson-batch";
import { getLanguageDisplayName, getLessonBatchSize, getLessonTokenTtlSeconds, getRetrySpacingMinimum } from "./lesson-config";
import { signLessonState, verifyLessonState } from "./lesson-token";
import { buildQuizQuestions, getQuestionAnswerSpec } from "./quiz-requirements";
import { interleaveQuizQuestions } from "./quiz-order";
import { rescheduleAfterIncorrect } from "./retry-scheduler";
import type {
  ItemSegmentState,
  LessonBatchSummary,
  LessonQuizState,
  LessonSessionResult,
  LessonStartResult,
  LessonState,
  QuizAnswerFeedback,
  QuizQuestionView,
  StudyItemView,
} from "./lesson-types";

/**
 * Orchestration boundary for the lesson flow (spec 07 §57, §62). Every
 * function here is server-authoritative: it verifies the signed token,
 * re-validates against curriculum data, and returns a new signed token —
 * the browser never decides eligibility, correctness, or completion.
 */

function itemLabel(item: LearningItem): string {
  return item.type === "vocabulary" ? item.word : item.structure;
}

function toBatchSummary(items: LearningItem[]): LessonBatchSummary[] {
  return items.map((item) => ({ itemId: item.id, itemType: item.type, label: itemLabel(item) }));
}

function directionLabel(languageId: string, direction: "targetToEnglish" | "englishToTarget"): string {
  const languageName = getLanguageDisplayName(languageId);
  return direction === "targetToEnglish" ? `${languageName} → English` : `English → ${languageName}`;
}

/** Loads full curriculum content for a lesson's batch, preserving batch order, and re-validates every item is still present. */
async function resolveOrderedBatchItems(state: LessonState): Promise<LearningItem[]> {
  const items = await getLearningItemsByIds(state.batch.map((batchItem) => batchItem.itemId));
  const ordered = state.batch
    .map((batchItem) => items.find((item) => item.id === batchItem.itemId))
    .filter((item): item is LearningItem => Boolean(item));

  if (ordered.length !== state.batch.length) {
    throw new LessonError("CURRICULUM_VALIDATION_FAILED");
  }

  return ordered;
}

async function buildQuestionView(state: LessonState, questionId: string): Promise<QuizQuestionView> {
  const question = state.quiz?.questions.find((q) => q.id === questionId);
  if (!question) throw new LessonError("LESSON_STATE_INVALID");

  const [item] = await getLearningItemsByIds([question.itemId]);
  if (!item) throw new LessonError("ITEM_NOT_FOUND");

  const spec = getQuestionAnswerSpec(item, question.direction);
  return {
    questionId,
    itemId: question.itemId,
    itemType: question.itemType,
    direction: question.direction,
    prompt: spec.prompt,
    directionLabel: directionLabel(state.languageId, question.direction),
  };
}

function computeItemStates(
  quiz: LessonQuizState | undefined,
  batchItems: LessonBatchSummary[],
): Record<string, ItemSegmentState> {
  const states: Record<string, ItemSegmentState> = {};

  if (!quiz) {
    for (const batchItem of batchItems) states[batchItem.itemId] = "not-started";
    return states;
  }

  const currentQuestion = quiz.questions.find((q) => q.id === quiz.queue[0]);
  const currentItemId = currentQuestion?.itemId;

  const requiredByItem = new Map<string, string[]>();
  for (const question of quiz.questions) {
    const list = requiredByItem.get(question.itemId) ?? [];
    list.push(question.id);
    requiredByItem.set(question.itemId, list);
  }

  for (const batchItem of batchItems) {
    const required = requiredByItem.get(batchItem.itemId) ?? [];
    const satisfiedCount = required.filter((id) => quiz.satisfiedQuestionIds.includes(id)).length;

    if (batchItem.itemId === currentItemId) {
      states[batchItem.itemId] = "current";
    } else if (required.length > 0 && satisfiedCount === required.length) {
      states[batchItem.itemId] = "complete";
    } else if (satisfiedCount > 0) {
      states[batchItem.itemId] = "partial";
    } else {
      states[batchItem.itemId] = "not-started";
    }
  }

  return states;
}

export type StartLessonInput = { userId: string; languageId: string; now?: number };

/** Spec 07 §10 — server-selected batch, signed initial state. */
export async function startLesson({ userId, languageId, now = Date.now() }: StartLessonInput): Promise<LessonStartResult> {
  const eligibleItems = await getEligibleLearningItems(userId, languageId);
  const batchSize = getLessonBatchSize();
  const selected = selectLessonBatch({ eligibleItems, batchSize });

  if (selected.length === 0) {
    return { kind: "empty" };
  }

  const ttlMs = getLessonTokenTtlSeconds() * 1000;

  const state: LessonState = {
    sessionId: crypto.randomUUID(),
    userId,
    languageId,
    batch: toLessonBatchItems(selected),
    viewedItemIds: [],
    phase: "study",
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  const token = await signLessonState(state);
  const batchSummary = toBatchSummary(selected);
  const studyItems: StudyItemView[] = selected.map((item) => ({ itemId: item.id, itemType: item.type, item }));

  return {
    kind: "session",
    token,
    phase: state.phase,
    sessionId: state.sessionId,
    batch: batchSummary,
    viewedItemIds: state.viewedItemIds,
    studyItems,
    itemStates: computeItemStates(undefined, batchSummary),
  };
}

export type OpenLessonItemInput = {
  token: string;
  userId: string;
  languageId: string;
  itemId: string;
  now?: number;
};

/** Spec 07 §18, §19 — marks a batch item viewed in the signed ephemeral state. Never creates database progress. */
export async function openLessonItem({
  token,
  userId,
  languageId,
  itemId,
  now = Date.now(),
}: OpenLessonItemInput): Promise<{ token: string; viewedItemIds: string[]; phase: LessonState["phase"] }> {
  const state = await verifyLessonState({ token, userId, languageId, now });

  if (state.phase !== "study") {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const belongsToBatch = state.batch.some((batchItem) => batchItem.itemId === itemId);
  if (!belongsToBatch) {
    throw new LessonError("ITEM_NOT_FOUND");
  }

  const viewedItemIds = state.viewedItemIds.includes(itemId)
    ? state.viewedItemIds
    : [...state.viewedItemIds, itemId];

  const nextState: LessonState = { ...state, viewedItemIds };
  const nextToken = await signLessonState(nextState);

  return { token: nextToken, viewedItemIds, phase: nextState.phase };
}

export type StartQuizInput = { token: string; userId: string; languageId: string; now?: number };

/** Spec 07 §20, §21 — requires every batch item viewed; builds the deterministic interleaved question queue. */
export async function startQuiz({ token, userId, languageId, now = Date.now() }: StartQuizInput): Promise<LessonSessionResult> {
  const state = await verifyLessonState({ token, userId, languageId, now });

  if (state.phase !== "study") {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const allViewed = state.batch.every((batchItem) => state.viewedItemIds.includes(batchItem.itemId));
  if (!allViewed) {
    throw new LessonError("LESSON_QUIZ_NOT_READY");
  }

  const orderedItems = await resolveOrderedBatchItems(state);
  const questions = interleaveQuizQuestions(buildQuizQuestions(orderedItems));
  const queue = questions.map((question) => question.id);

  const nextState: LessonState = {
    ...state,
    phase: "quiz",
    quiz: {
      questions,
      satisfiedQuestionIds: [],
      queue,
      attempts: 0,
      correctAttempts: 0,
    },
  };

  const nextToken = await signLessonState(nextState);
  const batchSummary = toBatchSummary(orderedItems);
  const currentQuestion = await buildQuestionView(nextState, queue[0]);

  return {
    token: nextToken,
    phase: nextState.phase,
    sessionId: nextState.sessionId,
    batch: batchSummary,
    viewedItemIds: nextState.viewedItemIds,
    currentQuestion,
    itemStates: computeItemStates(nextState.quiz, batchSummary),
    quizStats: { requiredCount: queue.length, satisfiedCount: 0, attempts: 0, correctAttempts: 0 },
  };
}

export type SubmitQuizAnswerInput = {
  token: string;
  userId: string;
  languageId: string;
  questionId: string;
  answer: string;
  now?: number;
};

/** Spec 07 §29-§41 — the only place a quiz answer is graded. The client never claims correctness or completion. */
export async function submitQuizAnswer({
  token,
  userId,
  languageId,
  questionId,
  answer,
  now = Date.now(),
}: SubmitQuizAnswerInput): Promise<LessonSessionResult> {
  const state = await verifyLessonState({ token, userId, languageId, now });

  if (state.phase !== "quiz" || !state.quiz) {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const currentQuestionId = state.quiz.queue[0];
  if (!currentQuestionId || currentQuestionId !== questionId) {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const question = state.quiz.questions.find((q) => q.id === questionId);
  if (!question) throw new LessonError("LESSON_STATE_INVALID");

  const orderedItems = await resolveOrderedBatchItems(state);
  const batchSummary = toBatchSummary(orderedItems);
  const item = orderedItems.find((candidate) => candidate.id === question.itemId);
  if (!item) throw new LessonError("ITEM_NOT_FOUND");

  const trimmedAnswer = answer.trim();

  if (trimmedAnswer.length === 0) {
    // Spec 07 §28: an empty submission is not an attempt and does not affect state.
    const currentQuestion = await buildQuestionView(state, currentQuestionId);
    return {
      token,
      phase: state.phase,
      sessionId: state.sessionId,
      batch: batchSummary,
      viewedItemIds: state.viewedItemIds,
      currentQuestion,
      itemStates: computeItemStates(state.quiz, batchSummary),
      quizStats: {
        requiredCount: state.quiz.questions.length,
        satisfiedCount: state.quiz.satisfiedQuestionIds.length,
        attempts: state.quiz.attempts,
        correctAttempts: state.quiz.correctAttempts,
      },
      feedback: { kind: "empty" },
    };
  }

  const spec = getQuestionAnswerSpec(item, question.direction);
  const result = checkAnswer({
    userAnswer: trimmedAnswer,
    acceptedAnswers: spec.acceptedAnswers,
    articleRequirement: spec.articleRequirement,
  });

  const restOfQueue = state.quiz.queue.slice(1);
  const attempts = state.quiz.attempts + 1;

  let nextQuiz: LessonQuizState;
  let feedback: QuizAnswerFeedback;

  if (result.isCorrect) {
    nextQuiz = {
      ...state.quiz,
      queue: restOfQueue,
      satisfiedQuestionIds: [...state.quiz.satisfiedQuestionIds, questionId],
      attempts,
      correctAttempts: state.quiz.correctAttempts + 1,
    };
    feedback = { kind: "correct" };
  } else {
    const rescheduledQueue = rescheduleAfterIncorrect(restOfQueue, questionId, getRetrySpacingMinimum());
    nextQuiz = { ...state.quiz, queue: rescheduledQueue, attempts };
    feedback =
      result.reason === "missing_article"
        ? {
            kind: "incorrect",
            reason: "missing_article",
            article: result.article,
            userAnswer: trimmedAnswer,
            expectedAnswer: spec.expectedAnswerDisplay,
          }
        : {
            kind: "incorrect",
            reason: "no_match",
            userAnswer: trimmedAnswer,
            expectedAnswer: spec.expectedAnswerDisplay,
          };
  }

  const nextPhase = nextQuiz.queue.length === 0 ? "complete" : "quiz";
  const nextState: LessonState = { ...state, phase: nextPhase, quiz: nextQuiz };
  const nextToken = await signLessonState(nextState);
  const nextQuestion = nextPhase === "quiz" ? await buildQuestionView(nextState, nextQuiz.queue[0]) : undefined;

  return {
    token: nextToken,
    phase: nextPhase,
    sessionId: nextState.sessionId,
    batch: batchSummary,
    viewedItemIds: nextState.viewedItemIds,
    currentQuestion: nextQuestion,
    itemStates: computeItemStates(nextQuiz, batchSummary),
    quizStats: {
      requiredCount: nextQuiz.questions.length,
      satisfiedCount: nextQuiz.satisfiedQuestionIds.length,
      attempts: nextQuiz.attempts,
      correctAttempts: nextQuiz.correctAttempts,
    },
    feedback,
  };
}
