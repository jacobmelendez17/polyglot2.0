import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Spec 20 "Lessons During Vacation": lessons stay available while Vacation
 * Mode is on, but the learner is warned first — newly learned items still
 * get their normal schedule calculated at enrollment, and only *that*
 * schedule ends up frozen (`domains/srs`'s `calculateVacationAdjustedReview`
 * handles this at the next vacation-end reconciliation; nothing here needs
 * to know that detail). Confirming re-requests `/lessons` with
 * `vacationConfirmed=1` so the server-side gate in `page.tsx` lets the
 * normal lesson flow proceed.
 */
export function LessonVacationWarning() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        You&apos;re currently in Vacation Mode.
      </h1>
      <p className="text-sm text-muted-foreground">
        New items can still be learned, but their review scheduling will remain
        frozen until Vacation Mode ends.
      </p>
      <p className="text-sm font-medium text-foreground">
        Are you sure you want to start a lesson?
      </p>
      <div className="mt-2 flex gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard">Cancel</Link>
        </Button>
        <Button asChild>
          <Link href="/lessons?vacationConfirmed=1">Start Lesson</Link>
        </Button>
      </div>
    </div>
  );
}
