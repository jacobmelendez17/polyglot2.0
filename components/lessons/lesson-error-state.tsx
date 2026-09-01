import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type LessonErrorStateProps = {
  error: { code: string; message: string };
};

const RECOVERABLE_CODES = new Set(["RATE_LIMITED", "UNKNOWN"]);

/**
 * Spec 07 §66: never a fake success state, and always clear about whether
 * progress was saved. A lesson error means no lesson item has entered SRS
 * yet (SRS enrollment only happens after full quiz completion), so this is
 * always safe to state plainly rather than ambiguously.
 */
export function LessonErrorState({ error }: LessonErrorStateProps) {
  const isRecoverable = RECOVERABLE_CODES.has(error.code);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <p className="text-xs text-muted-foreground">No progress was saved — nothing has entered your review queue yet.</p>
      <div className="mt-2 flex gap-2">
        {isRecoverable ? (
          <Button onClick={() => window.location.reload()}>Try again</Button>
        ) : (
          <Button asChild>
            <Link href="/lessons">Start a new lesson</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
