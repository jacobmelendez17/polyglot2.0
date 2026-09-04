import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

type ReviewEmptyStateProps = {
  nextReviewAt: Date | null;
};

/**
 * Spec 09 §18 — zero reviews due is a **success** state, not an empty/error
 * one: no bordered empty card, no "nothing here" framing.
 */
export function ReviewEmptyState({ nextReviewAt }: ReviewEmptyStateProps) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <CheckCircle2 className="h-8 w-8 text-state-success" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold text-foreground">No reviews due</h1>
      {nextReviewAt ? (
        <p className="text-sm text-muted-foreground">Next review: {formatRelativeTime(nextReviewAt, new Date())}</p>
      ) : null}
      <Button asChild className="mt-2">
        <Link href="/dashboard">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
