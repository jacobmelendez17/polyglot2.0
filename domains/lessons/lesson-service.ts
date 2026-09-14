import type { LearningItem } from "@/domains/curriculum";
import type { CurriculumMode, LanguageSettings } from "@/domains/users";
import { isThemeSelectionRequired } from "@/domains/users";
import { checkAnswer } from "@/lib/answer-checking";
import { LessonError } from "@/lib/errors/lesson-errors";

import { getAvailableThemes, selectLessonBatch, toLessonBatchItems } from "./lesson-batch";
import type { LessonCurriculumReader } from "./lesson-curriculum-reader";
import {
  getCharacterHelpers,
  getLanguageDisplayName,
  getLessonBatchSize,
  getLessonTokenTtlSeconds,
  getRetrySpacingMinimum,
} from "./lesson-config";
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
  LessonThemeChoice,
  QuizAnswerFeedback,
  QuizQuestionView,
  StudyItemView,
} from "./lesson-types";

/**
 * Orchestration boundary for the lesson flow (spec 07 §57, §62). Every
 * function here is server-authoritative: it verifies the signed token,
 * re-validates against curriculum data, and returns a new signed token —
 * the browser never decides eligibility, correctness, or completion.
 *
 * Curriculum arrives through an injected `LessonCurriculumReader` rather than
 * a direct import (spec 07 unit 6). The application passes the
 * database-backed reader; the unit tests pass the fixture one. Nothing in
 * this file knows or cares which.
 */

function itemLabel(item: LearningItem): string {
  return item.type === "vocabulary" ? item.word : item.structure;
}

function toBatchSummary(items: LearningItem[]): LessonBatchSummary[] {
  return items.map((item) => ({ itemId: item.id, itemType: item.type, label: itemLabel(item) }));
}

function directionLabel(languageCode: string, direction: "targetToEnglish" | "englishToTarget"): string {
  const languageName = getLanguageDisplayName(languageCode);
  return direction === "targetToEnglish" ? `${languageName} → English` : `English → ${languageName}`;
}

/** Loads full curriculum content for a lesson's batch, preserving batch order, and re-validates every item is still present. */
async function resolveOrderedBatchItems(
  curriculum: LessonCurriculumReader,
  state: LessonState,
): Promise<LearningItem[]> {
  const items = await curriculum.getLearningItemsByIds(state.batch.map((batchItem) => batchItem.itemId));
  const ordered = state.batch
    .map((batchItem) => items.find((item) => item.id === batchItem.itemId))
    .filter((item): item is LearningItem => Boolean(item));

  if (ordered.length !== state.batch.length) {
    throw new LessonError("CURRICULUM_VALIDATION_FAILED");
  }

  return ordered;
}

async function buildQuestionView(
  curriculum: LessonCurriculumReader,
  state: LessonState,
  questionId: string,
): Promise<QuizQuestionView> {
  const question = state.quiz?.questions.find((q) => q.id === questionId);
  if (!question) throw new LessonError("LESSON_STATE_INVALID");

  const [item] = await curriculum.getLearningItemsByIds([question.itemId]);
  if (!item) throw new LessonError("ITEM_NOT_FOUND");

  const spec = getQuestionAnswerSpec(item, question.direction);
  return {
    questionId,
    itemId: question.itemId,
    itemType: question.itemType,
    direction: question.direction,
    prompt: spec.prompt,
    directionLabel: directionLabel(state.languageCode, question.direction),
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

/**
 * The themes a learner can choose between right now, with how much is left
 * in each. Shared by `startLesson`'s `choose-theme` result and the
 * curriculum preference screen, so the two can never offer different lists.
 */
export function toThemeChoices(eligibleItems: LearningItem[]): LessonThemeChoice[] {
  const remainingByTheme = new Map<string, number>();
  for (const item of eligibleItems) {
    if (item.type !== "vocabulary" || !item.theme) continue;
    remainingByTheme.set(item.theme.id, (remainingByTheme.get(item.theme.id) ?? 0) + 1);
  }
  return getAvailableThemes(eligibleItems).map((theme) => ({
    id: theme.id,
    name: theme.name,
    remainingCount: remainingByTheme.get(theme.id) ?? 0,
  }));
}

/** Every theme this learner could still study in their current level (spec 16) — the preference screen's own list. */
export async function listAvailableThemes({
  curriculum,
  userId,
  languageId,
}: {
  curriculum: LessonCurriculumReader;
  userId: string;
  languageId: string;
}): Promise<LessonThemeChoice[]> {
  return toThemeChoices(await curriculum.getEligibleLearningItems(userId, languageId));
}

export type StartLessonInput = {
  curriculum: LessonCurriculumReader;
  userId: string;
  languageId: string;
  /** The language's stable code (`es-MX`), used for display names and character helpers. */
  languageCode: string;
  /**
   * The learner's curriculum preference for this language (spec 16), or
   * `null` when they have not chosen. Passed in rather than read here: this
   * module stays database-free and injectable, exactly as it does for
   * curriculum.
   */
  settings?: LanguageSettings | null;
  now?: number;
};

/** The mode a lesson is built under when the learner has no stored preference — used only by the fixture-backed unit tests and the pre-spec-16 call shape. */
const FALLBACK_CURRICULUM_MODE: CurriculumMode = "variety";

/**
 * Spec 07 §10 — server-selected batch, signed initial state — now under the
 * learner's spec 16 curriculum mode.
 *
 * A learner in Theme mode with no usable theme gets `choose-theme` rather
 * than an empty lesson: the batch is genuinely undecidable until they pick,
 * and silently choosing one for them would be the application making a
 * curriculum decision the spec assigns to the learner.
 */
export async function startLesson({
  curriculum,
  userId,
  languageId,
  languageCode,
  settings = null,
  now = Date.now(),
}: StartLessonInput): Promise<LessonStartResult> {
  const eligibleItems = await curriculum.getEligibleLearningItems(userId, languageId);
  const batchSize = getLessonBatchSize();
  const mode = settings?.curriculumMode ?? FALLBACK_CURRICULUM_MODE;

  if (mode === "choose_group") {
    const themes = toThemeChoices(eligibleItems);
    if (isThemeSelectionRequired(settings, themes.map((theme) => theme.id))) {
      // Nothing left in any group is "nothing left to learn", not a choice.
      if (themes.length === 0) return { kind: "empty" };
      return { kind: "choose-theme", themes };
    }
  }

  const selected = selectLessonBatch({
    eligibleItems,
    batchSize,
    mode,
    selectedThemeId: settings?.selectedVocabularyGroupId ?? null,
    grammarPlacement: settings?.grammarPlacement,
  });

  if (selected.length === 0) {
    return { kind: "empty" };
  }

  const ttlMs = getLessonTokenTtlSeconds() * 1000;

  const state: LessonState = {
    sessionId: crypto.randomUUID(),
    userId,
    languageId,
    languageCode,
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
    characterHelpers: getCharacterHelpers(state.languageCode),
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

export type StartQuizInput = { curriculum: LessonCurriculumReader; token: string; userId: string; languageId: string; now?: number };

/** Spec 07 §20, §21 — requires every batch item viewed; builds the deterministic interleaved question queue. */
export async function startQuiz({ curriculum, token, userId, languageId, now = Date.now() }: StartQuizInput): Promise<LessonSessionResult> {
  const state = await verifyLessonState({ token, userId, languageId, now });

  if (state.phase !== "study") {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const allViewed = state.batch.every((batchItem) => state.viewedItemIds.includes(batchItem.itemId));
  if (!allViewed) {
    throw new LessonError("LESSON_QUIZ_NOT_READY");
  }

  const orderedItems = await resolveOrderedBatchItems(curriculum, state);
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
  const currentQuestion = await buildQuestionView(curriculum, nextState, queue[0]);

  return {
    token: nextToken,
    phase: nextState.phase,
    sessionId: nextState.sessionId,
    batch: batchSummary,
    viewedItemIds: nextState.viewedItemIds,
    currentQuestion,
    itemStates: computeItemStates(nextState.quiz, batchSummary),
    characterHelpers: getCharacterHelpers(state.languageCode),
    quizStats: { requiredCount: queue.length, satisfiedCount: 0, attempts: 0, correctAttempts: 0 },
  };
}

export type SubmitQuizAnswerInput = {
  curriculum: LessonCurriculumReader;
  token: string;
  userId: string;
  languageId: string;
  questionId: string;
  answer: string;
  now?: number;
};

/** Spec 07 §29-§41 — the only place a quiz answer is graded. The client never claims correctness or completion. */
export async function submitQuizAnswer({
  curriculum,
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

  const orderedItems = await resolveOrderedBatchItems(curriculum, state);
  const batchSummary = toBatchSummary(orderedItems);
  const item = orderedItems.find((candidate) => candidate.id === question.itemId);
  if (!item) throw new LessonError("ITEM_NOT_FOUND");

  const trimmedAnswer = answer.trim();

  if (trimmedAnswer.length === 0) {
    // Spec 07 §28: an empty submission is not an attempt and does not affect state.
    const currentQuestion = await buildQuestionView(curriculum, state, currentQuestionId);
    return {
      token,
      phase: state.phase,
      sessionId: state.sessionId,
      batch: batchSummary,
      viewedItemIds: state.viewedItemIds,
      currentQuestion,
      itemStates: computeItemStates(state.quiz, batchSummary),
      characterHelpers: getCharacterHelpers(state.languageCode),
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
  const nextQuestion = nextPhase === "quiz" ? await buildQuestionView(curriculum, nextState, nextQuiz.queue[0]) : undefined;

  return {
    token: nextToken,
    phase: nextPhase,
    sessionId: nextState.sessionId,
    batch: batchSummary,
    viewedItemIds: nextState.viewedItemIds,
    currentQuestion: nextQuestion,
    itemStates: computeItemStates(nextQuiz, batchSummary),
    characterHelpers: getCharacterHelpers(state.languageCode),
    quizStats: {
      requiredCount: nextQuiz.questions.length,
      satisfiedCount: nextQuiz.satisfiedQuestionIds.length,
      attempts: nextQuiz.attempts,
      correctAttempts: nextQuiz.correctAttempts,
    },
    feedback,
  };
}
