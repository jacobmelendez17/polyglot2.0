import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import { AccentHelpers } from "@/components/lessons/accent-helpers";
import { AnswerInput } from "@/components/lessons/answer-input";
import { ExitLessonButton } from "@/components/lessons/exit-lesson-button";
import { LessonProgressSegments, type ProgressSegmentItem } from "@/components/lessons/lesson-progress-segments";
import type { QuizAnswerFeedback, QuizQuestionView, QuizStats } from "@/domains/lessons";

type QuizViewProps = {
  question: QuizQuestionView;
  feedback: QuizAnswerFeedback | null;
  awaitingAdvance: boolean;
  quizStats: QuizStats | null;
  segments: ProgressSegmentItem[];
  characterHelpers: readonly string[];
  isPending: boolean;
  onSubmit: (answer: string) => void;
  onAdvance: () => void;
  onExit: () => void;
};

/**
 * The comprehension quiz screen (spec 07 §26). Chromeless: no cards,
 * panels, bordered containers, or tinted surfaces anywhere — the
 * graph-paper background is the only surface.
 */
export function QuizView({
  question,
  feedback,
  awaitingAdvance,
  quizStats,
  segments,
  characterHelpers,
  isPending,
  onSubmit,
  onAdvance,
  onExit,
}: QuizViewProps) {
  const inputState = !feedback ? "default" : feedback.kind === "incorrect" ? "incorrect" : "correct";

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <ExitLessonButton onClick={onExit} />
        {quizStats ? (
          <p className="text-xs text-muted-foreground">
            Beginner 1 · {quizStats.satisfiedCount} / {quizStats.requiredCount} ·{" "}
            {quizStats.attempts === 0 ? "—" : `${Math.round((quizStats.correctAttempts / quizStats.attempts) * 100)}%`}
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
        <div className="text-center">
          <p className="font-heading text-4xl font-semibold text-foreground sm:text-5xl">{question.prompt}</p>
          <p className="mt-2 text-sm text-muted-foreground">{question.directionLabel}</p>
        </div>

        <QuestionAnswerField
          // Remounts per question so its local input state resets naturally on
          // advance, instead of resetting state imperatively inside an effect.
          key={question.questionId}
          inputState={inputState}
          awaitingAdvance={awaitingAdvance}
          isPending={isPending}
          characterHelpers={characterHelpers}
          onSubmit={onSubmit}
          onAdvance={onAdvance}
        />

        {feedback && feedback.kind !== "empty" ? <FeedbackRegion feedback={feedback} /> : null}
      </div>

      <div className="pb-4">
        <LessonProgressSegments items={segments} />
      </div>
    </div>
  );
}

type QuestionAnswerFieldProps = {
  inputState: "default" | "correct" | "incorrect";
  awaitingAdvance: boolean;
  isPending: boolean;
  characterHelpers: readonly string[];
  onSubmit: (answer: string) => void;
  onAdvance: () => void;
};

function QuestionAnswerField({
  inputState,
  awaitingAdvance,
  isPending,
  characterHelpers,
  onSubmit,
  onAdvance,
}: QuestionAnswerFieldProps) {
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
      input.setSelectionRange(start + character.length, start + character.length);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();

    if (awaitingAdvance) {
      onAdvance();
      return;
    }

    // Spec 07 §28: an empty submission does nothing and shows no error.
    if (answer.trim().length === 0) return;
    onSubmit(answer);
  }

  return (
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
      <AccentHelpers characters={characterHelpers} onInsert={insertCharacter} />
    </div>
  );
}

function FeedbackRegion({ feedback }: { feedback: Exclude<QuizAnswerFeedback, { kind: "empty" }> }) {
  if (feedback.kind === "correct") {
    return (
      <div className="flex items-center gap-2 text-state-success" role="status">
        <Check className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">Correct!</span>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-2 text-center" role="status">
      <div className="flex items-center gap-2 text-destructive">
        <X className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">Not quite</span>
      </div>

      <dl className="w-full text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">You entered</dt>
          <dd className="text-foreground">{feedback.userAnswer}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Expected</dt>
          <dd className="font-medium text-foreground">{feedback.expectedAnswer}</dd>
        </div>
      </dl>

      {feedback.reason === "missing_article" ? (
        <p className="text-xs text-muted-foreground">
          This word requires the article &ldquo;{feedback.article}&rdquo; when translating into the target language.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">This question will come back later. No progress was affected.</p>
    </div>
  );
}
