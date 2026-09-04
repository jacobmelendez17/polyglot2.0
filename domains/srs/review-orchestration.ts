import type { DbClient } from "@/db/client";
import { getLanguageById, getLearningItemsByIds, getLevelsByLanguage } from "@/domains/curriculum/curriculum-repository";
import type { CurriculumLanguage, CurriculumLearningItem } from "@/domains/curriculum/curriculum-db-types";
import { getSynonyms } from "@/domains/learner-content/repository";
import { getDueReviewItems, getUserProgressForLanguage } from "@/domains/progress/repository";
import type { ItemProgress } from "@/domains/progress/types";
import { checkAnswer } from "@/lib/answer-checking";
import { ReviewError } from "@/lib/errors/review-errors";

import { getReviewQuestionAnswerSpec } from "./review-answer-spec";
import { applyReviewCompletion } from "./review-completion";
import { getCharacterHelpers, getReviewRetrySpacingMinimum, getReviewStateTokenTtlSeconds } from "./review-config";
import { buildReviewQuestions, interleaveReviewQuestions } from "./review-queue";
import { rescheduleReviewAfterIncorrect } from "./review-retry";
import { signReviewState, verifyReviewState } from "./review-token";
import type {
  ReviewAnswerFeedback,
  ReviewItemSnapshot,
  ReviewQuestionView,
  ReviewSessionResult,
  ReviewSessionStats,
  ReviewStartResult,
  ReviewState,
} from "./review-types";

/**
 * Review-session orchestration (spec 09 unit 3), takes an injected
 * `DbClient` — matching every repository in this codebase (see
 * progress-tracker.md's "Repository functions take an injected DbClient"
 * Architecture Decision) — rather than reaching for the real `db` singleton
 * directly. This is what makes it possible to integration-test this
 * orchestration against a real, rolled-back transaction; it's also required
 * mechanically, not just stylistically: every other domain's real-db-bound
 * `server.ts` transitively imports `db/client.ts`, which is guarded by the
 * `server-only` package and throws immediately on import outside Next's
 * webpack build — including under Vitest — so calling those bound functions
 * from here would make this module untestable at all. Calling the
 * *repository*-tier functions of `domains/progress`, `domains/curriculum`,
 * and `domains/learner-content` directly (all already `DbClient`-injectable
 * themselves) sidesteps that entirely.
 *
 * There is no cross-domain atomicity requirement here — spec 09 unit 3 is
 * entirely read-only; nothing is persisted until the real atomic completion
 * transaction (a later unit) — so sharing one `db`/`tx` across these calls
 * is purely for testability, not correctness. `review-service.ts` binds the
 * real `db` singleton to these functions for actual server-side callers.
 */

function directionLabel(languageName: string, direction: "targetToEnglish" | "englishToTarget"): string {
  return direction === "targetToEnglish" ? `${languageName} → English` : `English → ${languageName}`;
}

async function resolveQuestionItems(db: DbClient, state: ReviewState): Promise<CurriculumLearningItem[]> {
  const itemIds = [...new Set(state.questions.map((question) => question.itemId))];
  const items = await getLearningItemsByIds(db, itemIds);
  if (items.length !== itemIds.length) {
    throw new ReviewError("ITEM_NOT_FOUND");
  }
  return items;
}

async function buildQuestionView(
  db: DbClient,
  state: ReviewState,
  questionId: string,
  items: CurriculumLearningItem[],
  language: CurriculumLanguage,
): Promise<ReviewQuestionView> {
  const question = state.questions.find((q) => q.id === questionId);
  if (!question) throw new ReviewError("INVALID_REVIEW_STATE");

  const item = items.find((candidate) => candidate.id === question.itemId);
  if (!item) throw new ReviewError("ITEM_NOT_FOUND");

  const synonyms = await getSynonyms(db, state.userId, question.itemId);
  const spec = getReviewQuestionAnswerSpec(item, question.direction, synonyms);

  return {
    questionId,
    itemId: question.itemId,
    itemType: question.itemType,
    direction: question.direction,
    prompt: spec.prompt,
    directionLabel: directionLabel(language.name, question.direction),
  };
}

function requiredQuestionIdsForItem(state: ReviewState, itemId: string): string[] {
  return state.questions.filter((question) => question.itemId === itemId).map((question) => question.id);
}

export type StartReviewSessionInput = { userId: string; languageId: string; now?: number };

/** Spec 09 §5, §7 — server-authoritative due-review queue, signed initial state. */
export async function startReviewSession(
  db: DbClient,
  { userId, languageId, now = Date.now() }: StartReviewSessionInput,
): Promise<ReviewStartResult> {
  const nowDate = new Date(now);
  const dueItems = await getDueReviewItems(db, userId, languageId, nowDate);

  if (dueItems.length === 0) {
    const allProgress = await getUserProgressForLanguage(db, userId, languageId);
    const upcoming = allProgress
      .map((progress: ItemProgress) => progress.nextReviewAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return { kind: "empty", nextReviewAt: upcoming ?? null };
  }

  const itemIds = dueItems.map((progress) => progress.learningItemId);
  const [curriculumItems, levels, language] = await Promise.all([
    getLearningItemsByIds(db, itemIds),
    getLevelsByLanguage(db, languageId),
    getLanguageById(db, languageId),
  ]);

  if (curriculumItems.length !== dueItems.length) {
    throw new ReviewError("ITEM_NOT_FOUND");
  }
  if (!language) {
    throw new ReviewError("ITEM_NOT_FOUND");
  }

  const levelNumberByLevelId = new Map(levels.map((level) => [level.id, level.levelNumber]));
  const curriculumItemById = new Map(curriculumItems.map((item) => [item.id, item]));

  const itemSnapshots: ReviewItemSnapshot[] = dueItems.map((progress) => {
    const curriculumItem = curriculumItemById.get(progress.learningItemId);
    const levelNumber = curriculumItem ? levelNumberByLevelId.get(curriculumItem.levelId) : undefined;
    if (!curriculumItem || levelNumber === undefined) {
      throw new ReviewError("ITEM_NOT_FOUND");
    }
    return { itemId: progress.learningItemId, stage: progress.srsStage, version: progress.version, levelNumber };
  });

  const questions = interleaveReviewQuestions(buildReviewQuestions(curriculumItems));
  const queue = questions.map((question) => question.id);

  const ttlMs = getReviewStateTokenTtlSeconds() * 1000;
  const stats: ReviewSessionStats = {
    itemsTotal: dueItems.length,
    itemsCompleted: 0,
    questionsAttempted: 0,
    questionsCorrect: 0,
  };

  const state: ReviewState = {
    sessionId: crypto.randomUUID(),
    userId,
    languageId,
    questions,
    queue,
    satisfiedQuestionIds: [],
    failedQuestionIds: [],
    completedItemIds: [],
    itemSnapshots,
    stats,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  const token = await signReviewState(state);
  const currentQuestion = await buildQuestionView(db, state, queue[0], curriculumItems, language);

  return {
    kind: "session",
    token,
    sessionId: state.sessionId,
    phase: "in_progress",
    currentQuestion,
    characterHelpers: getCharacterHelpers(language.code),
    stats,
  };
}

export type SubmitReviewAnswerInput = {
  token: string;
  userId: string;
  languageId: string;
  questionId: string;
  answer: string;
  /**
   * Client-generated UUID for this item's completion (spec 09 §12) — the
   * client generates one when it opens an item and reuses it across every
   * submission for that item, including retries after an incorrect
   * question returns. Required on every call for a simple, uniform
   * contract; only actually consumed on the submission that completes an
   * item — an unused key on a non-completing submission is harmless.
   */
  idempotencyKey: string;
  now?: number;
};

/** Spec 09 §7, §8, §10 — the only place a review answer is graded. When an item's last required question is satisfied, this calls the real atomic completion transaction (`applyReviewCompletion`) — never a preview past spec 09 unit 3. */
export async function submitReviewAnswer(
  db: DbClient,
  { token, userId, languageId, questionId, answer, idempotencyKey, now = Date.now() }: SubmitReviewAnswerInput,
): Promise<ReviewSessionResult> {
  const state = await verifyReviewState({ token, userId, languageId, now });

  const currentQuestionId = state.queue[0];
  if (!currentQuestionId || currentQuestionId !== questionId) {
    throw new ReviewError("INVALID_REVIEW_STATE");
  }

  const question = state.questions.find((q) => q.id === questionId);
  if (!question) throw new ReviewError("INVALID_REVIEW_STATE");

  const items = await resolveQuestionItems(db, state);
  const language = await getLanguageById(db, languageId);
  if (!language) throw new ReviewError("ITEM_NOT_FOUND");

  const item = items.find((candidate) => candidate.id === question.itemId);
  if (!item) throw new ReviewError("ITEM_NOT_FOUND");

  const trimmedAnswer = answer.trim();

  if (trimmedAnswer.length === 0) {
    // Spec 09 §7: an empty submission is not an attempt and does not affect state.
    const currentQuestion = await buildQuestionView(db, state, currentQuestionId, items, language);
    return {
      token,
      sessionId: state.sessionId,
      phase: "in_progress",
      currentQuestion,
      characterHelpers: getCharacterHelpers(language.code),
      stats: state.stats,
      feedback: { kind: "empty" },
    };
  }

  const synonyms = await getSynonyms(db, userId, question.itemId);
  const spec = getReviewQuestionAnswerSpec(item, question.direction, synonyms);
  const result = checkAnswer({
    userAnswer: trimmedAnswer,
    acceptedAnswers: spec.acceptedAnswers,
    articleRequirement: spec.articleRequirement,
  });

  const restOfQueue = state.queue.slice(1);
  const questionsAttempted = state.stats.questionsAttempted + 1;

  let nextState: ReviewState;
  let feedback: ReviewAnswerFeedback;

  if (result.isCorrect) {
    nextState = {
      ...state,
      queue: restOfQueue,
      satisfiedQuestionIds: [...state.satisfiedQuestionIds, questionId],
      stats: { ...state.stats, questionsAttempted, questionsCorrect: state.stats.questionsCorrect + 1 },
    };
    feedback = { kind: "correct" };
  } else {
    const rescheduledQueue = rescheduleReviewAfterIncorrect(restOfQueue, questionId, getReviewRetrySpacingMinimum());
    nextState = {
      ...state,
      queue: rescheduledQueue,
      failedQuestionIds: state.failedQuestionIds.includes(questionId)
        ? state.failedQuestionIds
        : [...state.failedQuestionIds, questionId],
      stats: { ...state.stats, questionsAttempted },
    };
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

  // Item completion: every required question for this item is now satisfied, and it hasn't already fired.
  let completedItem: ReviewSessionResult["completedItem"];
  let staleItem: ReviewSessionResult["staleItem"];
  if (result.isCorrect && !nextState.completedItemIds.includes(question.itemId)) {
    const requiredIds = requiredQuestionIdsForItem(nextState, question.itemId);
    const allSatisfied = requiredIds.every((id) => nextState.satisfiedQuestionIds.includes(id));

    if (allSatisfied) {
      const snapshot = nextState.itemSnapshots.find((s) => s.itemId === question.itemId);
      if (!snapshot) throw new ReviewError("INVALID_REVIEW_STATE");

      const hadIncorrectRequiredAnswer = requiredIds.some((id) => nextState.failedQuestionIds.includes(id));
      try {
        completedItem = await applyReviewCompletion(db, {
          userId,
          languageId,
          learningItemId: question.itemId,
          expectedVersion: snapshot.version,
          requiredQuestionCount: requiredIds.length,
          hadIncorrectRequiredAnswer,
          now: new Date(now),
          idempotencyKey,
          sessionId: state.sessionId,
        });
      } catch (error) {
        // Spec 09 §11: another tab/device already completed this exact item.
        // The learner's own answer was still graded correctly above — don't
        // discard that or block the rest of the session over it. Advance
        // past this item as already resolved, just not by this request.
        const isAlreadyResolvedElsewhere =
          error instanceof ReviewError && (error.code === "STALE_REVIEW" || error.code === "REVIEW_NOT_DUE");
        if (!isAlreadyResolvedElsewhere) throw error;
        staleItem = { itemId: question.itemId };
      }

      nextState = {
        ...nextState,
        completedItemIds: [...nextState.completedItemIds, question.itemId],
        stats: { ...nextState.stats, itemsCompleted: nextState.stats.itemsCompleted + 1 },
      };
    }
  }

  const phase: ReviewSessionResult["phase"] = nextState.queue.length === 0 ? "complete" : "in_progress";
  const nextToken = await signReviewState(nextState);
  const currentQuestion =
    phase === "in_progress" ? await buildQuestionView(db, nextState, nextState.queue[0], items, language) : undefined;

  return {
    token: nextToken,
    sessionId: nextState.sessionId,
    phase,
    currentQuestion,
    characterHelpers: getCharacterHelpers(language.code),
    stats: nextState.stats,
    feedback,
    completedItem,
    staleItem,
  };
}
