"use client";

import { useEffect } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { ArrowRight, Check, X } from "lucide-react";

import { congratulationsFor } from "@/components/reviews/congratulations";
import { PronunciationButton } from "@/components/shared/pronunciation-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReviewSessionResult, ReviewSessionStats } from "@/domains/srs";

/** One item answered during the session, with how many of its answers were right. */
export type ReviewSessionHistoryEntry = NonNullable<
  ReviewSessionResult["answeredItem"]
> & {
  attempts: number;
  correct: number;
};

type ReviewCompletionViewProps = {
  stats: ReviewSessionStats;
  /** Everything worked on this session, in the order first seen. */
  history?: readonly ReviewSessionHistoryEntry[];
  /** The learner ended the session before finishing the queue. */
  endedEarly?: boolean;
  /** `languages.code` of the language being learned — picks the greeting and the voice for pronunciation. */
  languageCode?: string;
};

/**
 * Spec 09 §18 — the session summary, shown both when the queue is finished
 * and when the learner ends the session early. A greeting in the language
 * being learned over a graph-paper background, then one card: accuracy on
 * the left, every item worked on (each its own card) on the right, and a
 * sticky footer to leave. Confetti only when the queue was actually
 * finished — ending early isn't a celebration.
 */
export function ReviewCompletionView({
  stats,
  history = [],
  endedEarly = false,
  languageCode = "",
}: ReviewCompletionViewProps) {
  const attempted = stats.questionsAttempted;
  const correct = stats.questionsCorrect;
  const incorrect = attempted - correct;
  const correctPercent =
    attempted === 0 ? 0 : Math.round((correct / attempted) * 100);
  const incorrectPercent = attempted === 0 ? 0 : 100 - correctPercent;

  useEffect(() => {
    if (endedEarly) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    void confetti({ particleCount: 140, spread: 80, origin: { y: 0.3 } });
  }, [endedEarly]);

  return (
    <div className="graph-paper-surface min-h-svh pb-28">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="text-center">
          <h1 className="font-heading text-4xl font-semibold text-primary sm:text-5xl">
            {congratulationsFor(languageCode)}
          </h1>
          <p className="mt-2 text-lg text-foreground">
            {endedEarly
              ? "Session ended"
              : `You completed ${stats.itemsCompleted} ${stats.itemsCompleted === 1 ? "review" : "reviews"}`}
          </p>
        </header>

        <Card className="grid gap-0 p-0 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <section
            aria-label="Session accuracy"
            className="flex flex-col items-center gap-6 border-b border-border p-6 md:border-r md:border-b-0"
          >
            <div className="text-center">
              <p className="font-heading text-6xl font-semibold text-foreground">
                {attempted === 0 ? "—" : `${correctPercent}%`}
              </p>
              <p className="mt-1 text-muted-foreground">Accuracy</p>
            </div>

            <div className="flex w-full justify-between text-sm">
              <p className="text-muted-foreground">
                Correct{" "}
                <span className="font-semibold text-state-success">
                  {correct}
                </span>
                <span className="block text-xs">{correctPercent}%</span>
              </p>
              <p className="text-right text-muted-foreground">
                Incorrect{" "}
                <span className="font-semibold text-destructive">
                  {incorrect}
                </span>
                <span className="block text-xs">{incorrectPercent}%</span>
              </p>
            </div>

            <div
              role="img"
              aria-label={`${correct} correct, ${incorrect} incorrect`}
              className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="bg-state-success"
                style={{ width: `${correctPercent}%` }}
              />
              <div
                className="bg-destructive"
                style={{ width: `${incorrectPercent}%` }}
              />
            </div>
          </section>

          <section
            aria-label="Items reviewed"
            className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto p-4"
          >
            {history.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                No items were answered this session.
              </p>
            ) : (
              history.map((entry) => (
                <ItemResultCard
                  key={entry.itemId}
                  entry={entry}
                  languageCode={languageCode}
                />
              ))
            )}
          </section>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background">
        <div className="mx-auto flex max-w-5xl justify-center px-4 py-4">
          <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-64">
            <Link href="/dashboard">Return To Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemResultCard({
  entry,
  languageCode,
}: {
  entry: ReviewSessionHistoryEntry;
  languageCode: string;
}) {
  const wasCorrect = entry.correct === entry.attempts;
  const targetText = entry.sentence?.targetText ?? entry.title;
  const translation = entry.sentence?.translation ?? entry.meaning;

  return (
    <Card size="sm" className="flex-row items-center gap-3 px-4">
      {wasCorrect ? (
        <Check
          className="size-5 shrink-0 text-state-success"
          aria-label="Correct"
        />
      ) : (
        <X
          className="size-5 shrink-0 text-destructive"
          aria-label="Incorrect"
        />
      )}
      <PronunciationButton
        text={targetText}
        languageCode={languageCode}
        label={targetText}
        size="sm"
      />
      <div className="min-w-0 flex-1 text-center">
        <p className="font-heading text-lg font-semibold text-foreground">
          {targetText}
        </p>
        <p className="text-sm text-muted-foreground">{translation}</p>
      </div>
      <Button asChild variant="ghost" size="sm" className="shrink-0">
        <Link
          href={`/items/${entry.itemId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View item <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Card>
  );
}
