"use client";

import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type DeckPracticeIntroProps = {
  deckName: string;
  itemCount: number;
  questionCount: number;
  knowDontKnowEnabled: boolean;
  onToggleKnowDontKnow: (enabled: boolean) => void;
  onStart: () => void;
  onExit: () => void;
};

/**
 * The pre-session screen (spec 14: "Before starting, provide an optional
 * Know / Don't Know toggle"). The toggle is genuinely optional and defaults
 * off, so the plain path is normal deck practice.
 *
 * The line about SRS is not decoration: a learner needs to know before they
 * start that nothing here will move their reviews.
 */
export function DeckPracticeIntro({
  deckName,
  itemCount,
  questionCount,
  knowDontKnowEnabled,
  onToggleKnowDontKnow,
  onStart,
  onExit,
}: DeckPracticeIntroProps) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">{deckName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {itemCount} {itemCount === 1 ? "item" : "items"} · {questionCount}{" "}
          {questionCount === 1 ? "question" : "questions"}
        </p>
      </div>

      <label className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left">
        <Checkbox
          className="mt-0.5"
          checked={knowDontKnowEnabled}
          onCheckedChange={(checked) => onToggleKnowDontKnow(checked === true)}
        />
        <span>
          <span className="block text-sm font-medium text-foreground">Know / Don&rsquo;t Know</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Mark each item as you go and get a breakdown at the end. Results are for this session only and are never
            saved.
          </span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        Deck practice never changes your SRS stages, review times, or curriculum progress.
      </p>

      <div className="flex w-full flex-col gap-2">
        <Button size="lg" onClick={onStart}>
          <Play aria-hidden="true" />
          Start practice
        </Button>
        <Button variant="ghost" onClick={onExit}>
          Back to deck
        </Button>
      </div>
    </div>
  );
}
