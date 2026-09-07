"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { deleteItemAction } from "@/app/(admin)/admin/curriculum/actions";

type ArchiveDeleteDialogProps = {
  learningItemId: string;
  itemLabel: string;
};

/**
 * Spec 11 rewrite's "Archive/Delete" — the admin always requests "Delete";
 * the server decides whether that's a real permanent delete or an
 * archive-instead fallback, based on referential integrity it actually
 * checks (never a client-side guess). Both outcomes require this same
 * explicit confirmation step first.
 */
export function ArchiveDeleteDialog({ learningItemId, itemLabel }: ArchiveDeleteDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ outcome: "deleted" | "archived"; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const response = await deleteItemAction({ learningItemId, idempotencyKey: crypto.randomUUID() });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setResult(response.data);
      if (response.data.outcome === "deleted") {
        router.push("/admin/curriculum");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{itemLabel}&rdquo;?</DialogTitle>
          <DialogDescription>
            If this item has any existing learner progress, it will be archived instead of permanently deleted — progress is never destroyed.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <p className="text-sm text-foreground">
            {result.outcome === "deleted" ? "Permanently deleted." : result.reason}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending || result !== null}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
