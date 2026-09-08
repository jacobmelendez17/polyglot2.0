"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteDeckAction } from "@/app/(app)/decks/actions";
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

type DeleteDeckDialogProps = {
  deckId: string;
  deckName: string;
};

/**
 * Deleting a personal deck (spec 14). Worth stating plainly in the dialog:
 * this removes the deck only. The curriculum items it referenced, and all
 * SRS progress on them, are untouched — a deck never owned them.
 */
export function DeleteDeckDialog({ deckId, deckName }: DeleteDeckDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDeckAction({ deckId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.push("/decks");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{deckName}”?</DialogTitle>
          <DialogDescription>
            This deletes the deck only. The words and grammar points inside it, and all of your review progress on them,
            stay exactly as they are.
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
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
