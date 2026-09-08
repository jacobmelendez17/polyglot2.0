"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { gradeDeckPracticeAnswerAction } from "@/app/(focus)/decks/[deckId]/practice/actions";
import { DeckPracticeComplete } from "@/components/decks/deck-practice-complete";
import { DeckPracticeIntro } from "@/components/decks/deck-practice-intro";
import { AccentHelpers } from "@/components/shared/accent-helpers";
import { AnswerInput } from "@/components/shared/answer-input";
import { ExitFocusButton } from "@/components/shared/exit-focus-button";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { summarizeDeckPractice } from "@/domains/decks";
import type { DeckPracticeFeedback, DeckPracticeQuestion, DeckPracticeVerdict } from "@/domains/decks";
import type { DeckPracticeClassification } from "@/domains/decks";

type ActionError = { code: string; message: string };

type PracticeState = {
  phase: "intro" | "practicing" | "complete";
  knowDontKnowEnabled: boolean;
  index: number;
  feedback: DeckPracticeFeedback | null;
  questionsAttempted: number;
  questionsCorrect: number;
  classifications: DeckPracticeClassification[];
  error: ActionError | null;
};

type PracticeAction =
  | { type: "TOGGLE_KNOW_DONT_KNOW"; enabled: boolean }
  | { type: "START" }
  | { type: "ANSWERED"; feedback: DeckPracticeFeedback }
  | { type: "ADVANCE"; questionCount: number }
  | { type: "CLASSIFY"; classification: DeckPracticeClassification; questionCount: number }
  | { type: "ERROR"; error: ActionError };

function advance(state: PracticeState, questionCount: number): PracticeState {
  const nextIndex = state.index + 1;
  return nextIndex >= questionCount
    ? { ...state, phase: "complete", feedback: null }
    : { ...state, index: nextIndex, feedback: null };
}

function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "TOGGLE_KNOW_DONT_KNOW":
      return { ...state, knowDontKnowEnabled: action.enabled };
    case "START":
      return { ...state, phase: "practicing" };
    case "ANSWERED":
      return {
        ...state,
        feedback: action.feedback,
        questionsAttempted: state.questionsAttempted + 1,
        questionsCorrect: state.questionsCorrect + (action.feedback.kind === "correct" ? 1 : 0),
      };
    case "ADVANCE":
      return advance(state, action.questionCount);
    case "CLASSIFY":
      return advance({ ...state, classifications: [...state.classifications, action.classification] }, action.questionCount);
    case "ERROR":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

type DeckPracticeViewProps = {
  deckId: string;
  deckName: string;
  itemCount: number;
  questions: DeckPracticeQuestion[];
  characterHelpers: readonly string[];
};

/**
 * The deck practice session (spec 14). All session state — the queue
 * position, the running counts, and the Know / Don't Know verdicts — lives
 * here in React state and nowhere else. Nothing is persisted, so refreshing
 * or navigating away simply ends the session, which is exactly what spec
 * 14's "session-only" rule requires; there is no progress to lose because
 * deck practice never earns any.
 *
 * The one thing the client does not decide is correctness: every answer goes
 * to the server, which holds the accepted answers and the learner's own
 * synonyms.
 *
 * A single pass — an incorrect answer is shown and the session moves on
 * rather than requeuing. Requeuing exists in lessons and reviews to gate an
 * SRS outcome, and deck practice has none.
 */
export function DeckPracticeView({ deckId, deckName, itemCount, questions, characterHelpers }: DeckPracticeViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(practiceReducer, {
    phase: "intro",
    knowDontKnowEnabled: false,
    index: 0,
    feedback: null,
    questionsAttempted: 0,
    questionsCorrect: 0,
    classifications: [],
    error: null,
  });

  /** Whether each question is the last one for its item — where a Know / Don't Know prompt belongs. */
  const isLastForItem = useMemo(() => {
    const lastIndexByItem = new Map<string, number>();
    questions.forEach((question, index) => lastIndexByItem.set(question.learningItemId, index));
    return questions.map((question, index) => lastIndexByItem.get(question.learningItemId) === index);
  }, [questions]);

  const question = questions[state.index];

  function handleSubmit(answer: string) {
    if (!question) return;
    startTransition(async () => {
      const result = await gradeDeckPracticeAnswerAction({
        deckId,
        learningItemId: question.learningItemId,
        direction: question.direction,
        answer,
      });
      if (!result.ok) {
        dispatch({ type: "ERROR", error: result.error });
        return;
      }
      dispatch({ type: "ANSWERED", feedback: result.data });
    });
  }

  function handleClassify(verdict: DeckPracticeVerdict) {
    if (!question) return;
    dispatch({
      type: "CLASSIFY",
      classification: { learningItemId: question.learningItemId, itemLabel: question.itemLabel, verdict },
      questionCount: questions.length,
    });
  }

  if (state.error) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <X className="h-8 w-8 text-destructive" aria-hidden="true" />
        <div>
          <h1 className="font-heading text-xl font-semibold text-foreground">Practice stopped</h1>
          <p className="mt-1 text-sm text-muted-foreground">{state.error.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing was saved — deck practice never changes your progress.
          </p>
        </div>
        <Button onClick={() => router.push(`/decks/${deckId}`)}>Back to deck</Button>
      </div>
    );
  }

  if (state.phase === "intro") {
    return (
      <DeckPracticeIntro
        deckName={deckName}
        itemCount={itemCount}
        questionCount={questions.length}
        knowDontKnowEnabled={state.knowDontKnowEnabled}
        onToggleKnowDontKnow={(enabled) => dispatch({ type: "TOGGLE_KNOW_DONT_KNOW", enabled })}
        onStart={() => dispatch({ type: "START" })}
        onExit={() => router.push(`/decks/${deckId}`)}
      />
    );
  }

  if (state.phase === "complete" || !question) {
    return (
      <DeckPracticeComplete
        deckId={deckId}
        questionsAttempted={state.questionsAttempted}
        questionsCorrect={state.questionsCorrect}
        summary={state.knowDontKnowEnabled ? summarizeDeckPractice(state.classifications) : null}
      />
    );
  }

  const awaitingAdvance = state.feedback !== null;
  const awaitingClassification = awaitingAdvance && state.knowDontKnowEnabled && isLastForItem[state.index];
  const progressPercent = Math.round((state.index / questions.length) * 100);
  const accuracyPercent =
    state.questionsAttempted === 0 ? null : Math.round((state.questionsCorrect / state.questionsAttempted) * 100);

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center gap-3">
        <ExitFocusButton label="Exit practice" onClick={() => router.push(`/decks/${deckId}`)} />
        <Progress value={progressPercent} aria-label="Practice progress" className="h-1.5 flex-1" />
        <p className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
          {questions.length - state.index} left{accuracyPercent !== null ? ` · ${accuracyPercent}%` : ""}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
        <div className="text-center">
          <p className="font-heading text-4xl font-semibold text-foreground sm:text-5xl">{question.prompt}</p>
          <p className="mt-2 text-sm text-muted-foreground">{question.directionLabel}</p>
        </div>

        <PracticeAnswerField
          // Remounts per question so the input resets naturally on advance.
          key={question.questionId}
          feedback={state.feedback}
          awaitingAdvance={awaitingAdvance}
          awaitingClassification={Boolean(awaitingClassification)}
          isPending={isPending}
          characterHelpers={characterHelpers}
          onSubmit={handleSubmit}
          onAdvance={() => dispatch({ type: "ADVANCE", questionCount: questions.length })}
          onClassify={handleClassify}
        />

        {state.feedback ? <PracticeFeedback feedback={state.feedback} /> : null}
      </div>
    </div>
  );
}

type PracticeAnswerFieldProps = {
  feedback: DeckPracticeFeedback | null;
  awaitingAdvance: boolean;
  awaitingClassification: boolean;
  isPending: boolean;
  characterHelpers: readonly string[];
  onSubmit: (answer: string) => void;
  onAdvance: () => void;
  onClassify: (verdict: DeckPracticeVerdict) => void;
};

function PracticeAnswerField({
  feedback,
  awaitingAdvance,
  awaitingClassification,
  isPending,
  characterHelpers,
  onSubmit,
  onAdvance,
  onClassify,
}: PracticeAnswerFieldProps) {
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputState = !feedback ? "default" : feedback.kind === "incorrect" ? "incorrect" : "correct";

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
    setAnswer(answer.slice(0, start) + character + answer.slice(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + character.length, start + character.length);
    });
  }

  function handlePrimaryAction() {
    if (awaitingClassification) return;
    if (awaitingAdvance) {
      onAdvance();
      return;
    }
    // An empty submission does nothing and shows no error, as in reviews.
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
        <AccentHelpers characters={characterHelpers} onInsert={insertCharacter} />
      </div>

      {awaitingClassification ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Did you know this one?</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onClassify("dont_know")}>
              Don&rsquo;t Know
            </Button>
            <Button type="button" onClick={() => onClassify("know")}>
              Know
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={handlePrimaryAction}
          disabled={!awaitingAdvance && answer.trim().length === 0}
        >
          {awaitingAdvance ? "Continue" : "Submit"}
        </Button>
      )}
    </div>
  );
}

function PracticeFeedback({ feedback }: { feedback: DeckPracticeFeedback }) {
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
    </div>
  );
}
