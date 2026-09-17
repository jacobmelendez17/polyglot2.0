"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { publishItemAction } from "@/app/(admin)/admin/curriculum/actions";

/**
 * Publishing one queued item from the review list (spec 17).
 *
 * Deliberately just Publish: spec 17 scopes out a send-back workflow, so an
 * Admin either releases the work or leaves it waiting, and anything needing
 * changes is edited on the item's own page.
 *
 * `expectedVersion` carries the optimistic-concurrency check the publish
 * path already enforces, so verifying a stale row from a list somebody else
 * has since changed is refused rather than silently applied.
 */
export function ReviewQueueActions({
  learningItemId,
  expectedVersion,
}: {
  learningItemId: string;
  expectedVersion: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishItemAction({
        learningItemId,
        expectedVersion,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-sm text-state-error">
          {error}
        </span>
      ) : null}
      <Button type="button" size="sm" onClick={publish} disabled={isPending}>
        Publish
      </Button>
    </div>
  );
}
