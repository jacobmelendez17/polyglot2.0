"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/logging/client-error";

/** The hub is a pure read, so a failure here never leaves progress in doubt — the message says so. */
export default function PracticeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { route: "/practice" });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Couldn&apos;t load Practice
      </h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong loading this page. Your progress is safe — nothing
        here changes it.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
