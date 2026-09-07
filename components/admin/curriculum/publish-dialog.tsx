"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { publishItemAction } from "@/app/(admin)/admin/curriculum/actions";

type PublishDialogProps = {
  learningItemId: string;
  itemLabel: string;
  expectedVersion: number;
  isDraftEdit: boolean;
};

/**
 * Spec 11 rewrite's "Publication"/"Concurrency Protection". A stale
 * `expectedVersion` surfaces the exact `ADMIN_EDIT_CONFLICT` copy the spec
 * specifies, with a reload action rather than silently retrying — retrying
 * blind would publish the admin's now-outdated view on top of whatever
 * changed underneath them.
 */
export function PublishDialog({ learningItemId, itemLabel, expectedVersion, isDraftEdit }: PublishDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  function handlePublish() {
    setError(null);
    setConflict(false);
    startTransition(async () => {
      const result = await publishItemAction({ learningItemId, expectedVersion, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        if (result.error.code === "ADMIN_EDIT_CONFLICT") {
          setConflict(true);
          return;
        }
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{isDraftEdit ? "Publish changes" : "Publish"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish &ldquo;{itemLabel}&rdquo;?</DialogTitle>
          <DialogDescription>
            {isDraftEdit
              ? "This will replace the currently live content with your edited version. Existing learner progress stays attached to this item."
              : "This item will become visible to learners for the first time."}
          </DialogDescription>
        </DialogHeader>

        {conflict ? (
          <p role="alert" className="text-sm text-state-error">
            This item changed after you opened it. Reload the latest version before publishing.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {conflict ? (
            <Button variant="outline" onClick={() => router.refresh()}>
              Reload
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePublish} disabled={isPending}>
                Publish
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
