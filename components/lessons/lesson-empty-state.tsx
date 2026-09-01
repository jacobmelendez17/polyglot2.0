import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Spec 07 §65 — no eligible lesson items right now. */
export function LessonEmptyState() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <Sparkles className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold text-foreground">No lessons available right now.</h1>
      <p className="text-sm text-muted-foreground">
        You&apos;ve studied everything currently unlocked. Check back once more material unlocks.
      </p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
