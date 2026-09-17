"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import {
  addDeckItemsAction,
  searchEligibleDeckItemsAction,
} from "@/app/(app)/decks/actions";
import { DeckItemPicker } from "@/components/decks/deck-item-picker";
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

type AddDeckItemsDialogProps = {
  deckId: string;
  existingItemIds: string[];
};

/** Adds already-learned items to an existing personal deck (spec 14's "add unlocked items"). */
export function AddDeckItemsDialog({
  deckId,
  existingItemIds,
}: AddDeckItemsDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (selectedIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addDeckItemsAction({
        deckId,
        learningItemIds: selectedIds,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSelectedIds([]);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus aria-hidden="true" />
          Add items
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add items</DialogTitle>
          <DialogDescription>
            Only items you have already learned can be added to a deck.
          </DialogDescription>
        </DialogHeader>

        <DeckItemPicker
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          search={(query) => searchEligibleDeckItemsAction({ search: query })}
          alreadyInDeckIds={existingItemIds}
          emptyMessage="Nothing to add yet — finish a lesson and your items will show up here."
        />

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isPending || selectedIds.length === 0}
          >
            Add {selectedIds.length > 0 ? selectedIds.length : ""}{" "}
            {selectedIds.length === 1 ? "item" : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
