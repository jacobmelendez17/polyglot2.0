import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type ReviewErrorStateProps = {
  error: { code: string; message: string };
};

const RECOVERABLE_CODES = new Set(["RATE_LIMITED", "UNKNOWN"]);

/**
 * Spec 09 §18/§19: errors must clearly state whether progress was saved.
 * `STALE_REVIEW`/`REVIEW_NOT_DUE` never reach this component — those are
 * handled inline by `ReviewSessionView` per spec 09 §11 (the learner
 * continues the session; nothing here blocks that). This state is for a
 * genuine failure to save the completing mutation itself, so it can say
 * plainly that no SRS progress changed for that attempt.
 */
export function ReviewErrorState({ error }: ReviewErrorStateProps) {
  const isRecoverable = RECOVERABLE_CODES.has(error.code);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold text-foreground">We couldn&apos;t save this review</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <p className="text-xs text-muted-foreground">Your SRS progress was not changed.</p>
      <div className="mt-2 flex gap-2">
        {isRecoverable ? (
          <Button onClick={() => window.location.reload()}>Try again</Button>
        ) : (
          <Button asChild>
            <Link href="/reviews">Back to reviews</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
