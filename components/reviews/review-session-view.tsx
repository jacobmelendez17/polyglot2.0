"use client";

import { useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitReviewAnswerAction } from "@/app/(focus)/reviews/actions";
import { ReviewCompletionView } from "@/components/reviews/review-completion-view";
import { ReviewErrorState } from "@/components/reviews/review-error-state";
import { ReviewExitDialog } from "@/components/reviews/review-exit-dialog";
import { ReviewQuestionView } from "@/components/reviews/review-question-view";
import { ReviewTopBar } from "@/components/reviews/review-top-bar";
import type { ReviewAnswerFeedback, ReviewQuestionView as ReviewQuestionViewData, ReviewSessionResult, ReviewSessionStats } from "@/domains/srs";

type ActionError = { code: string; message: string };

type SessionState = {
  token: string;
  phase: "in_progress" | "complete";
  currentQuestion: ReviewQuestionViewData | null;
  pendingQuestion: ReviewQuestionViewData | null;
  characterHelpers: readonly string[];
  stats: ReviewSessionStats;
  feedback: ReviewAnswerFeedback | null;
  /** One-shot notice for the item that was just answered correctly but whose completion was already applied elsewhere (spec 09 §11) — shown alongside the correct-answer feedback, cleared on advance. */
  staleNotice: { itemId: string } | null;
  /** Stable for the currently-displayed question; regenerated only when the question changes (spec 09 §12 — reused across retries of the same submission, not per attempt). */
  idempotencyKey: string;
  error: ActionError | null;
};

type SessionAction =
  | { type: "ANSWER_SUBMITTED"; result: ReviewSessionResult }
  | { type: "ADVANCE_QUESTION" }
  | { type: "ERROR"; error: ActionError };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "ANSWER_SUBMITTED": {
      if (action.result.feedback?.kind === "empty") {
        // Spec 09 §7: an empty submission does nothing.
        return state;
      }
      return {
        ...state,
        token: action.result.token,
        phase: action.result.phase,
        pendingQuestion: action.result.currentQuestion ?? null,
        characterHelpers: action.result.characterHelpers,
        stats: action.result.stats,
        feedback: action.result.feedback ?? null,
        staleNotice: action.result.staleItem ?? null,
      };
    }
    case "ADVANCE_QUESTION":
      return {
        ...state,
        currentQuestion: state.pendingQuestion,
        pendingQuestion: null,
        feedback: null,
        staleNotice: null,
        idempotencyKey: crypto.randomUUID(),
      };
    case "ERROR":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

type ReviewSessionViewProps = {
  initial: ReviewSessionResult;
};

/**
 * Top-level review state machine (spec 09 §6, §16). Holds the signed
 * review-state token only in React state — never localStorage/sessionStorage/
 * a cookie — so refresh or navigation away discards unfinished in-session
 * progress exactly as the ephemeral model requires (spec 09 §6): already
 * completed items remain saved (they persisted transactionally the moment
 * they completed), and a half-completed item simply remains due.
 */
export function ReviewSessionView({ initial }: ReviewSessionViewProps) {
  const router = useRouter();

  const [state, dispatch] = useReducer(sessionReducer, {
    token: initial.token,
    phase: initial.phase,
    currentQuestion: initial.currentQuestion ?? null,
    pendingQuestion: null,
    characterHelpers: initial.characterHelpers,
    stats: initial.stats,
    feedback: null,
    staleNotice: null,
    idempotencyKey: crypto.randomUUID(),
    error: null,
  });

  const [isPending, startTransition] = useTransition();
  const [isExitDialogOpen, setExitDialogOpen] = useState(false);

  function handleSubmitAnswer(answer: string) {
    const questionId = state.currentQuestion?.questionId;
    if (!questionId) return;
    startTransition(async () => {
      const result = await submitReviewAnswerAction({
        token: state.token,
        questionId,
        answer,
        idempotencyKey: state.idempotencyKey,
      });
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
    return <ReviewErrorState error={state.error} />;
  }

  const awaitingAdvance = state.pendingQuestion !== null || (state.feedback !== null && state.phase === "complete");

  if (!state.currentQuestion && state.phase === "complete" && !awaitingAdvance) {
    return <ReviewCompletionView stats={state.stats} />;
  }

  const remaining = state.stats.itemsTotal - state.stats.itemsCompleted;
  const progressPercent =
    state.stats.itemsTotal === 0 ? 100 : Math.round((state.stats.itemsCompleted / state.stats.itemsTotal) * 100);
  const accuracyPercent =
    state.stats.questionsAttempted === 0
      ? null
      : Math.round((state.stats.questionsCorrect / state.stats.questionsAttempted) * 100);

  return (
    <>
      <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-6">
        <ReviewTopBar
          onExit={() => setExitDialogOpen(true)}
          progressPercent={progressPercent}
          remaining={Math.max(remaining, 0)}
          accuracyPercent={accuracyPercent}
        />

        {state.currentQuestion ? (
          <ReviewQuestionView
            question={state.currentQuestion}
            feedback={state.feedback}
            awaitingAdvance={awaitingAdvance}
            characterHelpers={state.characterHelpers}
            isPending={isPending}
            onSubmit={handleSubmitAnswer}
            onAdvance={() => dispatch({ type: "ADVANCE_QUESTION" })}
          />
        ) : null}

        {state.staleNotice ? (
          <p role="status" className="pb-4 text-center text-xs text-muted-foreground">
            This review was already updated elsewhere. No additional progress change was applied.
          </p>
        ) : null}
      </div>

      <ReviewExitDialog open={isExitDialogOpen} onOpenChange={setExitDialogOpen} onConfirm={handleExitConfirm} />
    </>
  );
}
