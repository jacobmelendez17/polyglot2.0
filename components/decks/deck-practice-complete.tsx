"use client";

import Link from "next/link";
import { useState } from "react";
import { PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DeckPracticeSummary } from "@/domains/decks";

type DeckPracticeCompleteProps = {
  deckId: string;
  questionsAttempted: number;
  questionsCorrect: number;
  /** Present only when the learner enabled Know / Don't Know for this session. */
  summary: DeckPracticeSummary | null;
};

type ResultGroup = "know" | "dont_know";

/**
 * The end-of-session screen (spec 14's "Deck Complete / Know / Don't Know"
 * summary, with the result list groupable by verdict).
 *
 * Everything shown here was computed from React state that existed only for
 * this session. Nothing was written, so leaving this page discards it — that
 * is the spec's "session-only" rule, not an omission.
 */
export function DeckPracticeComplete({ deckId, questionsAttempted, questionsCorrect, summary }: DeckPracticeCompleteProps) {
  const [group, setGroup] = useState<ResultGroup>("know");
  const accuracy = questionsAttempted === 0 ? null : Math.round((questionsCorrect / questionsAttempted) * 100);
  const shown = summary === null ? [] : group === "know" ? summary.know : summary.dontKnow;

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <PartyPopper className="h-10 w-10 text-primary" aria-hidden="true" />

      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Deck Complete</h1>
        {accuracy !== null ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {questionsCorrect} of {questionsAttempted} correct · {accuracy}%
          </p>
        ) : null}
      </div>

      {summary ? (
        <div className="w-full space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <dt className="text-xs font-medium text-muted-foreground">Know</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">{summary.knowCount}</dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <dt className="text-xs font-medium text-muted-foreground">Don&rsquo;t Know</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">{summary.dontKnowCount}</dd>
            </div>
          </dl>

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={group}
            onValueChange={(next) => {
              if (next) setGroup(next as ResultGroup);
            }}
            aria-label="Group results"
            className="w-full"
          >
            <ToggleGroupItem value="know">Know ({summary.knowCount})</ToggleGroupItem>
            <ToggleGroupItem value="dont_know">Don&rsquo;t Know ({summary.dontKnowCount})</ToggleGroupItem>
          </ToggleGroup>

          {shown.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
              Nothing in this group this session.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-left">
              {shown.map((entry) => (
                <li key={entry.learningItemId} className="px-4 py-2 text-sm text-foreground">
                  {entry.itemLabel}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">These results are not saved.</p>
        </div>
      ) : null}

      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg">
          <Link href={`/decks/${deckId}`}>Back to deck</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/decks">All decks</Link>
        </Button>
      </div>
    </div>
  );
}
