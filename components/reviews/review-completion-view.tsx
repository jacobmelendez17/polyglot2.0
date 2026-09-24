import Link from "next/link";
import { PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
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
};

/**
 * Spec 09 §18 — a minimal completion view. Deliberately no large new
 * gamification/celebration system in this spec (§18's explicit scope
 * boundary), matching `LessonCompleteView`'s same restraint. Also the
 * destination when a session is ended early, where the list of items worked
 * on is what makes it a summary rather than just a goodbye.
 */
export function ReviewCompletionView({
  stats,
  history = [],
  endedEarly = false,
}: ReviewCompletionViewProps) {
  const accuracy =
    stats.questionsAttempted === 0
      ? null
      : Math.round((stats.questionsCorrect / stats.questionsAttempted) * 100);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center gap-6 px-4 py-10 text-center">
      {!endedEarly ? (
        <PartyPopper className="h-10 w-10 text-primary" aria-hidden="true" />
      ) : null}

      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {endedEarly ? "Session ended" : "Session complete!"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats.itemsCompleted}{" "}
          {stats.itemsCompleted === 1 ? "review" : "reviews"} completed
        </p>
      </div>

      {accuracy !== null ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Session accuracy
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {accuracy}%
          </p>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="w-full text-left" aria-label="Items reviewed">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            Reviewed this session
          </h2>
          <ul className="divide-y divide-border">
            {history.map((entry) => (
              <li
                key={entry.itemId}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {entry.title}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {entry.meaning}
                  </p>
                </div>
                <p
                  className={
                    entry.correct === entry.attempts
                      ? "shrink-0 text-sm text-state-success"
                      : "shrink-0 text-sm text-destructive"
                  }
                >
                  {entry.correct}/{entry.attempts} correct
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Button asChild size="lg" className="w-full">
        <Link href="/dashboard">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
