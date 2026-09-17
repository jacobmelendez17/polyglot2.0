import { useEffect, useRef, useState } from "react";
import { Check, Undo2, X } from "lucide-react";

import { ReviewHint } from "@/components/reviews/review-hint";
import { AccentHelpers } from "@/components/shared/accent-helpers";
import { AnswerInput } from "@/components/shared/answer-input";
import { Button } from "@/components/ui/button";
import { highlightAnswerDiff } from "@/lib/answer-checking";
import { SRS_STAGE_LABELS } from "@/domains/srs";
import type {
  ReviewAnswerFeedback,
  ReviewItemCompletionPreview,
  ReviewQuestionView,
  ReviewUiPreferences,
} from "@/domains/srs";

type ReviewQuestionViewProps = {
  question: ReviewQuestionView;
  feedback: ReviewAnswerFeedback | null;
  awaitingAdvance: boolean;
  characterHelpers: readonly string[];
  isPending: boolean;
  reviewUiPreferences: ReviewUiPreferences;
  /** Present only on the submit that just completed this item — spec 20 Review UI's Show SRS Stage renders it here when present. */
  completedItem?: ReviewItemCompletionPreview;
  onSubmit: (answer: string) => void;
  /** Spec 20 Reviews — Flashcard/Cloze (Flashcard): the learner's self-report after Reveal. */
  onKnowsAnswer: (knowsAnswer: boolean) => void;
  onAdvance: () => void;
};

/**
 * The distraction-free review prompt (spec 09 §16), extended by spec 20
 * Reviews' Review Types and Review UI: `question.presentation` decides
 * whether this renders a typed answer field or a Reveal + Know/Don't Know
 * control, and whether the prompt is the item's normal prompt or a Cloze
 * sentence with a blank; `reviewUiPreferences` layers Auto Highlight Errors,
 * Show SRS Stage, Auto-Expand Info, and Undo Action on top without a second
 * review implementation (spec's own "Do not create a separate review
 * implementation for Focus Mode" applies just as much here). No card,
 * panel, or bordered container around the prompt — the page background is
 * the only surface. Rendered inside `ReviewSessionView`, below
 * `ReviewTopBar`.
 */
export function ReviewQuestionView({
  question,
  feedback,
  awaitingAdvance,
  characterHelpers,
  isPending,
  reviewUiPreferences,
  completedItem,
  onSubmit,
  onKnowsAnswer,
  onAdvance,
}: ReviewQuestionViewProps) {
  const inputState = !feedback
    ? "default"
    : feedback.kind === "incorrect"
      ? "incorrect"
      : "correct";
  const { presentation } = question;
  const isCloze =
    presentation.kind === "cloze_typed" || presentation.kind === "cloze_reveal";
  const isTyped =
    presentation.kind === "typed" || presentation.kind === "cloze_typed";
  // Spec 20 Review UI — Auto-Expand Info: "After submitting a review answer,
  // automatically expand supplemental information." Lightning Mode "wins"
  // for a correct answer needs no special-casing here — when it auto-
  // advances immediately, this view is gone before the reveal would matter.
  const autoExpandHint =
    reviewUiPreferences.autoExpandInfo && feedback !== null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
      <div className="text-center">
        {isCloze ? (
          <ClozeSentence
            sentenceBefore={presentation.sentenceBefore}
            sentenceAfter={presentation.sentenceAfter}
          />
        ) : (
          <p className="font-heading text-4xl font-semibold text-foreground sm:text-5xl">
            {presentation.prompt}
          </p>
        )}
        {!isCloze ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {question.directionLabel}
          </p>
        ) : null}
      </div>

      <ReviewHint
        key={question.questionId}
        hint={question.hint}
        autoExpand={autoExpandHint}
      />

      {isTyped ? (
        <AnswerField
          // Remounts per question so its local input state resets naturally on
          // advance, instead of resetting state imperatively inside an effect.
          key={question.questionId}
          inputState={inputState}
          awaitingAdvance={awaitingAdvance}
          isPending={isPending}
          characterHelpers={characterHelpers}
          undoAction={reviewUiPreferences.undoAction}
          onSubmit={onSubmit}
          onAdvance={onAdvance}
        />
      ) : (
        <RevealField
          key={question.questionId}
          revealAnswer={presentation.revealAnswer}
          revealLabel={
            presentation.kind === "cloze_reveal" ? "Reveal" : "Reveal Answer"
          }
          awaitingAdvance={awaitingAdvance}
          isPending={isPending}
          onKnowsAnswer={onKnowsAnswer}
          onAdvance={onAdvance}
        />
      )}

      {feedback && feedback.kind !== "empty" ? (
        <FeedbackRegion
          feedback={feedback}
          autoHighlightErrors={reviewUiPreferences.autoHighlightErrors}
          showSrsStage={reviewUiPreferences.showSrsStage}
          completedItem={completedItem}
        />
      ) : null}
    </div>
  );
}

function ClozeSentence({
  sentenceBefore,
  sentenceAfter,
}: {
  sentenceBefore: string;
  sentenceAfter: string;
}) {
  return (
    <p className="font-heading text-2xl leading-relaxed font-semibold text-foreground sm:text-3xl">
      {sentenceBefore}
      <span
        className="mx-1 inline-block min-w-16 border-b-2 border-foreground/40 align-bottom"
        aria-hidden="true"
      >
        &nbsp;
      </span>
      {sentenceAfter}
    </p>
  );
}

type AnswerFieldProps = {
  inputState: "default" | "correct" | "incorrect";
  awaitingAdvance: boolean;
  isPending: boolean;
  characterHelpers: readonly string[];
  undoAction: ReviewUiPreferences["undoAction"];
  onSubmit: (answer: string) => void;
  onAdvance: () => void;
};

function AnswerField({
  inputState,
  awaitingAdvance,
  isPending,
  characterHelpers,
  undoAction,
  onSubmit,
  onAdvance,
}: AnswerFieldProps) {
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function insertCharacter(character: string) {
    const input = inputRef.current;
    if (!input) {
      setAnswer((current) => current + character);
      return;
    }
    const start = input.selectionStart ?? answer.length;
    const end = input.selectionEnd ?? answer.length;
    const next = answer.slice(0, start) + character + answer.slice(end);
    setAnswer(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        start + character.length,
        start + character.length,
      );
    });
  }

  function handleUndo() {
    // Spec 20 Review UI — Undo Action.
    setAnswer((current) =>
      undoAction === "clear_all_characters" ? "" : current.slice(0, -1),
    );
    inputRef.current?.focus();
  }

  function handlePrimaryAction() {
    if (awaitingAdvance) {
      onAdvance();
      return;
    }
    // Spec 09 §7: an empty submission does nothing and shows no error.
    if (answer.trim().length === 0) return;
    onSubmit(answer);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handlePrimaryAction();
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full flex-col items-center gap-3">
        <AnswerInput
          ref={inputRef}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={handleKeyDown}
          state={inputState}
          readOnly={awaitingAdvance || isPending}
          aria-label="Your answer"
        />
        <AccentHelpers
          characters={characterHelpers}
          onInsert={insertCharacter}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Undo"
          onClick={handleUndo}
          disabled={awaitingAdvance || isPending || answer.length === 0}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={handlePrimaryAction}
          disabled={!awaitingAdvance && answer.trim().length === 0}
        >
          {awaitingAdvance ? "Continue" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

type RevealFieldProps = {
  revealAnswer: string;
  revealLabel: string;
  awaitingAdvance: boolean;
  isPending: boolean;
  onKnowsAnswer: (knowsAnswer: boolean) => void;
  onAdvance: () => void;
};

/**
 * Spec 20 Reviews — Flashcard/Cloze (Flashcard): Reveal, then a self-graded
 * Know/Don't Know in place of a typed, server-checked answer. Remounted per
 * question (`key={question.questionId}` at the call site) so `isRevealed`
 * always starts fresh, the same way `AnswerField`'s local input state does.
 */
function RevealField({
  revealAnswer,
  revealLabel,
  awaitingAdvance,
  isPending,
  onKnowsAnswer,
  onAdvance,
}: RevealFieldProps) {
  const [isRevealed, setRevealed] = useState(false);

  if (awaitingAdvance) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="font-heading text-3xl font-semibold text-foreground">
          {revealAnswer}
        </p>
        <Button type="button" variant="ghost" onClick={onAdvance}>
          Continue
        </Button>
      </div>
    );
  }

  if (!isRevealed) {
    return (
      <Button
        type="button"
        onClick={() => setRevealed(true)}
        disabled={isPending}
      >
        {revealLabel}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-heading text-3xl font-semibold text-foreground">
        {revealAnswer}
      </p>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onKnowsAnswer(false)}
          disabled={isPending}
        >
          Don&apos;t Know
        </Button>
        <Button
          type="button"
          onClick={() => onKnowsAnswer(true)}
          disabled={isPending}
        >
          Know
        </Button>
      </div>
    </div>
  );
}

function FeedbackRegion({
  feedback,
  autoHighlightErrors,
  showSrsStage,
  completedItem,
}: {
  feedback: Exclude<ReviewAnswerFeedback, { kind: "empty" }>;
  autoHighlightErrors: boolean;
  showSrsStage: boolean;
  completedItem?: ReviewItemCompletionPreview;
}) {
  if (feedback.kind === "correct") {
    return (
      <div className="flex flex-col items-center gap-1" role="status">
        <div className="flex items-center gap-2 text-state-success">
          <Check className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">Correct!</span>
        </div>
        {/* Spec 20 Review UI — Show SRS Stage: presentation only, never the actual SRS result. */}
        {showSrsStage && completedItem ? (
          <p className="text-xs text-muted-foreground">
            {SRS_STAGE_LABELS[completedItem.stageBefore]} →{" "}
            {SRS_STAGE_LABELS[completedItem.stageAfter]}
          </p>
        ) : null}
      </div>
    );
  }

  if (feedback.kind === "self_graded_incorrect") {
    return (
      <div
        className="flex flex-col items-center gap-2 text-center"
        role="status"
      >
        <div className="flex items-center gap-2 text-destructive">
          <X className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">Not quite</span>
        </div>
        <p className="text-xs text-muted-foreground">
          This question will come back later in the session.
        </p>
      </div>
    );
  }

  // Spec 20 Review UI — Auto Highlight Errors: the diff already refuses to
  // render (`highlightAnswerDiff` returns null) rather than fabricate one
  // when the two answers are mostly unrelated — the plain "You entered" line
  // is the fallback for exactly that case, same as when the toggle is off.
  const highlighted = autoHighlightErrors
    ? highlightAnswerDiff(feedback.userAnswer, feedback.expectedAnswer)
    : null;

  return (
    <div
      className="flex w-full max-w-sm flex-col items-center gap-2 text-center"
      role="status"
    >
      <div className="flex items-center gap-2 text-destructive">
        <X className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">Not quite</span>
      </div>

      <dl className="w-full text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">You entered</dt>
          <dd className="text-foreground">
            {highlighted ? (
              <span>
                {highlighted.map((segment, index) => (
                  <span
                    key={index}
                    className={
                      segment.correct
                        ? undefined
                        : "font-semibold text-destructive underline decoration-wavy"
                    }
                  >
                    {segment.text}
                  </span>
                ))}
              </span>
            ) : (
              feedback.userAnswer
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Expected</dt>
          <dd className="font-medium text-foreground">
            {feedback.expectedAnswer}
          </dd>
        </div>
      </dl>

      {feedback.reason === "missing_article" ? (
        <p className="text-xs text-muted-foreground">
          This word requires the article &ldquo;{feedback.article}&rdquo; when
          translating into the target language.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        This question will come back later in the session.
      </p>
    </div>
  );
}
