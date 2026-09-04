import Link from "next/link";
import { PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReviewSessionStats } from "@/domains/srs";

type ReviewCompletionViewProps = {
  stats: ReviewSessionStats;
};

/**
 * Spec 09 §18 — a minimal completion view. Deliberately no large new
 * gamification/celebration system in this spec (§18's explicit scope
 * boundary), matching `LessonCompleteView`'s same restraint.
 */
export function ReviewCompletionView({ stats }: ReviewCompletionViewProps) {
  const accuracy = stats.questionsAttempted === 0 ? null : Math.round((stats.questionsCorrect / stats.questionsAttempted) * 100);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <PartyPopper className="h-10 w-10 text-primary" aria-hidden="true" />

      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Session complete!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats.itemsCompleted} {stats.itemsCompleted === 1 ? "review" : "reviews"} completed
        </p>
      </div>

      {accuracy !== null ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Session accuracy</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{accuracy}%</p>
        </div>
      ) : null}

      <Button asChild size="lg" className="w-full">
        <Link href="/dashboard">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
