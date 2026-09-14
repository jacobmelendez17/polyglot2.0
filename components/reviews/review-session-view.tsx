"use client";

import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitReviewAnswerAction } from "@/app/(focus)/reviews/actions";
import { ReviewCompletionView } from "@/components/reviews/review-completion-view";
import { ReviewErrorState } from "@/components/reviews/review-error-state";
import { ReviewExitDialog } from "@/components/reviews/review-exit-dialog";
import { ReviewQuestionView } from "@/components/reviews/review-question-view";
import { ReviewTopBar } from "@/components/reviews/review-top-bar";
import { DEFAULT_REVIEW_PREFERENCES } from "@/domains/srs";
import type {
  ReviewAnswerFeedback,
  ReviewItemCompletionPreview,
  ReviewQuestionView as ReviewQuestionViewData,
  ReviewSessionResult,
  ReviewSessionStats,
  ReviewUiPreferences,
} from "@/domains/srs";
import { browserSpeechSynthesisProvider } from "@/providers/speech/speech-synthesis-provider";

type ActionError = { code: string; message: string };

type SessionState = {
  token: string;
  phase: "in_progress" | "complete";
  currentQuestion: ReviewQuestionViewData | null;
  pendingQuestion: ReviewQuestionViewData | null;
  characterHelpers: readonly string[];
  stats: ReviewSessionStats;
  feedback: ReviewAnswerFeedback | null;
  /** Present only for the submit that just completed an item (spec 20 Review UI — Show SRS Stage) — cleared on advance, same lifetime as `feedback`. */
  completedItem: ReviewItemCompletionPreview | null;
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
        completedItem: action.result.completedItem ?? null,
        staleNotice: action.result.staleItem ?? null,
      };
    }
    case "ADVANCE_QUESTION":
      return {
        ...state,
        currentQuestion: state.pendingQuestion,
        pendingQuestion: null,
        feedback: null,
        completedItem: null,
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
  // Resolved server-side once, at session start — same "only the initial
  // mount needs it" precedent `domains/lessons`' `languageCode`/
  // `autoPronounceLessons` established (spec 20 Lessons unit 9).
  const languageCode = initial.languageCode ?? "";
  const reviewUiPreferences: ReviewUiPreferences = initial.reviewUiPreferences ?? DEFAULT_REVIEW_PREFERENCES;

  const [state, dispatch] = useReducer(sessionReducer, {
    token: initial.token,
    phase: initial.phase,
    currentQuestion: initial.currentQuestion ?? null,
    pendingQuestion: null,
    characterHelpers: initial.characterHelpers,
    stats: initial.stats,
    feedback: null,
    completedItem: null,
    staleNotice: null,
    idempotencyKey: crypto.randomUUID(),
    error: null,
  });

  const [isPending, startTransition] = useTransition();
  const [isExitDialogOpen, setExitDialogOpen] = useState(false);

  function submit(submission: { kind: "typed"; answer: string } | { kind: "self_graded"; knowsAnswer: boolean }) {
    const questionId = state.currentQuestion?.questionId;
    if (!questionId) return;
    startTransition(async () => {
      const result = await submitReviewAnswerAction({
        token: state.token,
        questionId,
        idempotencyKey: state.idempotencyKey,
        submission,
      });
      if (!result.ok) {
        dispatch({ type: "ERROR", error: result.error });
        return;
      }
      dispatch({ type: "ANSWER_SUBMITTED", result: result.data });
    });
  }

  function handleSubmitAnswer(answer: string) {
    submit({ kind: "typed", answer });
  }

  function handleKnowsAnswer(knowsAnswer: boolean) {
    submit({ kind: "self_graded", knowsAnswer });
  }

  function handleExitConfirm() {
    setExitDialogOpen(false);
    router.push("/dashboard");
  }

  // Spec 20 Review UI — Autoplay Audio ("separate from Lesson auto-
  // pronunciation"): fires once per newly-appearing item, not on every
  // question (Flashcard shows the same item twice, for its two directions).
  // No curriculum audio recordings exist for reviews today (unlike Lessons'
  // fixture data), so this always uses browser speech synthesis.
  const lastPronouncedItemId = useRef<string | null>(null);
  useEffect(() => {
    const question = state.currentQuestion;
    if (!question || !reviewUiPreferences.autoplayAudio) return;
    if (lastPronouncedItemId.current === question.itemId) return;
    lastPronouncedItemId.current = question.itemId;
    browserSpeechSynthesisProvider.speak({ text: question.pronunciationText, languageCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentQuestion?.itemId]);

  useEffect(() => {
    return () => browserSpeechSynthesisProvider.cancel();
  }, []);

  // Spec 20 Review UI — Lightning Mode: "correct answer -> brief feedback ->
  // automatically advance," including for a self-graded "Know." Incorrect
  // (and self-graded "Don't Know") answers always still require an explicit
  // advance, matching "incorrect answers still show enough feedback to
  // understand the mistake."
  useEffect(() => {
    if (!reviewUiPreferences.lightningMode || state.feedback?.kind !== "correct") return;
    const timer = setTimeout(() => dispatch({ type: "ADVANCE_QUESTION" }), 600);
    return () => clearTimeout(timer);
  }, [reviewUiPreferences.lightningMode, state.feedback]);

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
          // Spec 20 Review UI — Focus Mode: "removes nonessential visual
          // elements" — Exit, the prompt, answer controls, required
          // feedback, and progress count all stay; the accuracy percentage
          // is the one piece confidently identifiable as nonessential.
          focusMode={reviewUiPreferences.focusMode}
        />

        {state.currentQuestion ? (
          <ReviewQuestionView
            question={state.currentQuestion}
            feedback={state.feedback}
            awaitingAdvance={awaitingAdvance}
            characterHelpers={state.characterHelpers}
            isPending={isPending}
            reviewUiPreferences={reviewUiPreferences}
            completedItem={state.completedItem ?? undefined}
            onSubmit={handleSubmitAnswer}
            onKnowsAnswer={handleKnowsAnswer}
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
