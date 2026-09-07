"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Spec 13's "loading/error states" requirement. Browsing an item never
 * mutates progress, so unlike `ReviewErrorState` there is no SRS-safety
 * caveat to state — this is purely a failed read.
 */
export default function ItemDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold text-foreground">Couldn&apos;t load this item</h1>
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
