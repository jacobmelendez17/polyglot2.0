"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { bulkConfirmVocabularyMappingsAction } from "@/app/(admin)/admin/dictionary/actions";

type BulkConfirmMappingsBarProps = {
  vocabularyItemIds: string[];
  onDone: () => void;
};

/** Spec 13's "batch confirmation of reviewed mappings" — mirrors `components/admin/curriculum/bulk-actions-bar.tsx`'s exact shape. */
export function BulkConfirmMappingsBar({
  vocabularyItemIds,
  onDone,
}: BulkConfirmMappingsBarProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = vocabularyItemIds.length;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await bulkConfirmVocabularyMappingsAction({
        vocabularyItemIds,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      onDone();
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium text-foreground">
        {count} selected
      </span>
      <Button variant="ghost" size="sm" onClick={onDone}>
        Clear
      </Button>
      <div className="ml-auto">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Confirm selected</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Confirm {count} mapping{count === 1 ? "" : "s"}?
              </DialogTitle>
              <DialogDescription>
                Each selected match becomes locked against future automatic
                changes. Only confirm rows you&apos;ve actually reviewed — this
                doesn&apos;t re-check them for you.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p role="alert" className="text-sm text-state-error">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
