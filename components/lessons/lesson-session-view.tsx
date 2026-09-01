"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  completeLessonAction,
  openLessonItemAction,
  startQuizAction,
  submitQuizAnswerAction,
} from "@/app/(focus)/lessons/actions";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "@/components/lessons/category-badge";
import { ExitLessonButton } from "@/components/lessons/exit-lesson-button";
import { ExitLessonDialog } from "@/components/lessons/exit-lesson-dialog";
import { LessonCompleteView } from "@/components/lessons/lesson-complete-view";
import { LessonErrorState } from "@/components/lessons/lesson-error-state";
import { LessonItemTabs } from "@/components/lessons/lesson-item-tabs";
import { LessonProgressSegments, type ProgressSegmentItem } from "@/components/lessons/lesson-progress-segments";
import { QuizView } from "@/components/lessons/quiz-view";
import { getCharacterHelpers } from "@/domains/lessons";
import type {
  ItemSegmentState,
  LessonCompletionPreview,
  LessonPhase,
  LessonSessionResult,
  QuizAnswerFeedback,
  QuizQuestionView,
  QuizStats,
} from "@/domains/lessons";
import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";

type ActionError = { code: string; message: string };

type SessionState = {
  token: string;
  phase: LessonPhase;
  viewedItemIds: string[];
  currentStudyIndex: number;
  currentQuestion: QuizQuestionView | null;
  pendingQuestion: QuizQuestionView | null;
  itemStates: Record<string, ItemSegmentState>;
  pendingItemStates: Record<string, ItemSegmentState> | null;
  quizStats: QuizStats | null;
  pendingQuizStats: QuizStats | null;
  feedback: QuizAnswerFeedback | null;
  completion: LessonCompletionPreview | null;
  error: ActionError | null;
};

type SessionAction =
  | { type: "ITEM_VIEWED"; token: string; viewedItemIds: string[] }
  | { type: "SELECT_STUDY_INDEX"; index: number }
  | { type: "QUIZ_STARTED"; result: LessonSessionResult }
  | { type: "ANSWER_SUBMITTED"; result: LessonSessionResult }
  | { type: "ADVANCE_QUESTION" }
  | { type: "LESSON_COMPLETED"; completion: LessonCompletionPreview }
  | { type: "ERROR"; error: ActionError };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "ITEM_VIEWED":
      return { ...state, token: action.token, viewedItemIds: action.viewedItemIds };
    case "SELECT_STUDY_INDEX":
      return { ...state, currentStudyIndex: action.index };
    case "QUIZ_STARTED":
      return {
        ...state,
        token: action.result.token,
        phase: action.result.phase,
        currentQuestion: action.result.currentQuestion ?? null,
        pendingQuestion: null,
        itemStates: action.result.itemStates ?? state.itemStates,
        pendingItemStates: null,
        quizStats: action.result.quizStats ?? state.quizStats,
        pendingQuizStats: null,
        feedback: null,
      };
    case "ANSWER_SUBMITTED": {
      if (action.result.feedback?.kind === "empty") {
        // Spec 07 §28: an empty submission does nothing.
        return state;
      }
      // itemStates/quizStats already reflect the just-graded answer, but the
      // displayed question (currentQuestion) deliberately stays on the old
      // question until the learner advances past feedback (§28) — so these
      // are held as "pending" and applied together with the question swap in
      // ADVANCE_QUESTION, rather than updating immediately. Applying them
      // immediately would jump the progress segment to the next item while
      // the just-answered item's prompt/feedback was still on screen.
      return {
        ...state,
        token: action.result.token,
        phase: action.result.phase,
        pendingQuestion: action.result.currentQuestion ?? null,
        pendingItemStates: action.result.itemStates ?? null,
        pendingQuizStats: action.result.quizStats ?? null,
        feedback: action.result.feedback ?? null,
      };
    }
    case "ADVANCE_QUESTION":
      return {
        ...state,
        currentQuestion: state.pendingQuestion,
        pendingQuestion: null,
        itemStates: state.pendingItemStates ?? state.itemStates,
        pendingItemStates: null,
        quizStats: state.pendingQuizStats ?? state.quizStats,
        pendingQuizStats: null,
        feedback: null,
      };
    case "LESSON_COMPLETED":
      return { ...state, completion: action.completion };
    case "ERROR":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

type LessonSessionViewProps = {
  initial: LessonSessionResult;
};

/**
 * Top-level lesson state machine (spec 07 §3, §6). Holds the signed lesson
 * token only in React state for the lifetime of this page — never
 * localStorage/sessionStorage/a cookie (§5) — so refresh or navigation
 * away discards it, matching the intentionally ephemeral session.
 */
export function LessonSessionView({ initial }: LessonSessionViewProps) {
  const router = useRouter();
  const batch = initial.batch;
  const studyItems = useMemo(() => initial.studyItems ?? [], [initial.studyItems]);
  const characterHelpers = getCharacterHelpers(FIXTURE_LANGUAGE_ID);

  const [state, dispatch] = useReducer(sessionReducer, {
    token: initial.token,
    phase: initial.phase,
    viewedItemIds: initial.viewedItemIds,
    currentStudyIndex: 0,
    currentQuestion: initial.currentQuestion ?? null,
    pendingQuestion: null,
    itemStates: initial.itemStates ?? {},
    pendingItemStates: null,
    quizStats: initial.quizStats ?? null,
    pendingQuizStats: null,
    feedback: null,
    completion: null,
    error: null,
  });

  const [isPending, startTransition] = useTransition();
  const [isExitDialogOpen, setExitDialogOpen] = useState(false);
  const hasMarkedFirstItem = useRef(false);

  const markViewed = useCallback(
    (itemId: string) => {
      startTransition(async () => {
        const result = await openLessonItemAction({ token: state.token, itemId });
        if (!result.ok) {
          dispatch({ type: "ERROR", error: result.error });
          return;
        }
        dispatch({ type: "ITEM_VIEWED", token: result.data.token, viewedItemIds: result.data.viewedItemIds });
      });
    },
    [state.token],
  );

  // Mark the first study item viewed on mount — merely rendering it isn't enough on its
  // own to unlock the quiz (§18), so this establishes the server-authoritative record.
  // Guarded to the study phase: a lesson always starts in "study" in practice, but this
  // keeps the effect a no-op if the session ever mounts already past it.
  useEffect(() => {
    if (hasMarkedFirstItem.current || state.phase !== "study") return;
    hasMarkedFirstItem.current = true;
    const first = studyItems[0];
    if (first && !state.viewedItemIds.includes(first.itemId)) {
      markViewed(first.itemId);
    }
  }, [markViewed, state.phase, state.viewedItemIds, studyItems]);

  // Once the server confirms the quiz is complete, request the (non-persisting)
  // completion preview exactly once — see lesson-completion-preview.ts.
  useEffect(() => {
    if (state.phase !== "complete" || state.completion || state.currentQuestion) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await completeLessonAction({ token: state.token });
      if (cancelled) return;
      if (!result.ok) {
        dispatch({ type: "ERROR", error: result.error });
        return;
      }
      dispatch({ type: "LESSON_COMPLETED", completion: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.completion, state.currentQuestion, state.token]);

  function handleSelectStudyIndex(index: number) {
    dispatch({ type: "SELECT_STUDY_INDEX", index });
    const item = studyItems[index];
    if (item && !state.viewedItemIds.includes(item.itemId)) {
      markViewed(item.itemId);
    }
  }

  function handleNext() {
    const total = studyItems.length;
    if (state.currentStudyIndex < total - 1) {
      handleSelectStudyIndex(state.currentStudyIndex + 1);
      return;
    }
    const firstUnviewed = studyItems.findIndex((item) => !state.viewedItemIds.includes(item.itemId));
    if (firstUnviewed !== -1) handleSelectStudyIndex(firstUnviewed);
  }

  function handleStartQuiz() {
    startTransition(async () => {
      const result = await startQuizAction({ token: state.token });
      if (!result.ok) {
        dispatch({ type: "ERROR", error: result.error });
        return;
      }
      dispatch({ type: "QUIZ_STARTED", result: result.data });
    });
  }

  function handleSubmitAnswer(answer: string) {
    const questionId = state.currentQuestion?.questionId;
    if (!questionId) return;
    startTransition(async () => {
      const result = await submitQuizAnswerAction({ token: state.token, questionId, answer });
      if (!result.ok) {
        dispatch({ type: "ERROR", error: result.error });
        return;
      }
      dispatch({ type: "ANSWER_SUBMITTED", result: result.data });
    });
  }

  function handleExitConfirm() {
    setExitDialogOpen(false);
    router.push("/dashboard");
  }

  if (state.error) {
    return <LessonErrorState error={state.error} />;
  }

  if (state.completion) {
    return <LessonCompleteView completion={state.completion} />;
  }

  const segments: ProgressSegmentItem[] = batch.map((batchItem) => {
    if (state.phase !== "study") {
      const itemState = state.itemStates[batchItem.itemId] ?? "not-started";
      return {
        itemId: batchItem.itemId,
        itemType: batchItem.itemType,
        state: itemState,
        stateLabel: QUIZ_STATE_LABELS[itemState],
      };
    }

    const isCurrent = studyItems[state.currentStudyIndex]?.itemId === batchItem.itemId;
    const isViewed = state.viewedItemIds.includes(batchItem.itemId);
    return {
      itemId: batchItem.itemId,
      itemType: batchItem.itemType,
      state: isCurrent ? "current" : isViewed ? "complete" : "not-started",
      stateLabel: isCurrent ? "current" : isViewed ? "viewed" : "not viewed",
    };
  });

  if (state.currentQuestion) {
    return (
      <>
        <QuizView
          question={state.currentQuestion}
          feedback={state.feedback}
          awaitingAdvance={state.pendingQuestion !== null || (state.feedback !== null && state.phase === "complete")}
          quizStats={state.quizStats}
          segments={segments}
          characterHelpers={characterHelpers}
          isPending={isPending}
          onSubmit={handleSubmitAnswer}
          onAdvance={() => dispatch({ type: "ADVANCE_QUESTION" })}
          onExit={() => setExitDialogOpen(true)}
        />
        <ExitLessonDialog open={isExitDialogOpen} onOpenChange={setExitDialogOpen} onConfirm={handleExitConfirm} />
      </>
    );
  }

  if (state.phase === "complete") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Finishing up…</p>
      </div>
    );
  }

  const currentItem = studyItems[state.currentStudyIndex];
  const allViewed = batch.every((batchItem) => state.viewedItemIds.includes(batchItem.itemId));

  return (
    <>
      <div className="mx-auto flex min-h-svh max-w-3xl flex-col px-4 py-6">
        <div className="flex items-center justify-between">
          <ExitLessonButton onClick={() => setExitDialogOpen(true)} />
          {currentItem ? (
            <p className="text-sm text-muted-foreground">
              Level {currentItem.item.levelId} • {state.currentStudyIndex + 1} / {studyItems.length}
            </p>
          ) : null}
        </div>

        {currentItem ? (
          <>
            <header className="mt-6 flex flex-col items-center gap-2 text-center">
              <CategoryBadge itemType={currentItem.itemType} />
              <h1 className="font-heading text-4xl font-semibold text-foreground">
                {currentItem.item.type === "vocabulary" ? currentItem.item.word : currentItem.item.structure}
              </h1>
              <p className="text-lg text-muted-foreground">
                {currentItem.item.type === "vocabulary" ? currentItem.item.meanings[0] : currentItem.item.meaning}
              </p>
            </header>

            <div className="mt-8 flex-1 overflow-y-auto pb-6">
              <LessonItemTabs item={currentItem.item} />
            </div>
          </>
        ) : null}

        <div className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pt-4 pb-6">
          <LessonProgressSegments
            items={segments}
            onSelect={(itemId) => {
              const index = studyItems.findIndex((item) => item.itemId === itemId);
              if (index !== -1) handleSelectStudyIndex(index);
            }}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={allViewed ? handleStartQuiz : handleNext} disabled={isPending}>
              {allViewed ? "Start Quiz" : "Next"}
            </Button>
          </div>
        </div>
      </div>

      <ExitLessonDialog open={isExitDialogOpen} onOpenChange={setExitDialogOpen} onConfirm={handleExitConfirm} />
    </>
  );
}

const QUIZ_STATE_LABELS: Record<ItemSegmentState, string> = {
  current: "current",
  complete: "complete",
  partial: "partially satisfied",
  "not-started": "not started",
};
