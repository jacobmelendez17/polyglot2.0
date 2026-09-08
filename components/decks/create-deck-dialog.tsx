"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { createDeckAction, searchEligibleDeckItemsAction } from "@/app/(app)/decks/actions";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DECK_DESCRIPTION_MAX_LENGTH, DECK_NAME_MAX_LENGTH } from "@/domains/decks";

/**
 * Personal deck creation (spec 14): name, optional description, and one or
 * more already-learned items. The Create button stays disabled until at
 * least one item is selected — a deck cannot be created empty — and the
 * server enforces the same rule regardless.
 */
export function CreateDeckDialog() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setSelectedIds([]);
    setError(null);
  }

  function handleCreate() {
    if (name.trim().length === 0) {
      setError("Give your deck a name.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Pick at least one item — a deck cannot be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createDeckAction({
        name,
        description,
        learningItemIds: selectedIds,
        // Regenerated per submission attempt, so a retry after a failure is a
        // genuinely new request while a double-click on one attempt is not.
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      reset();
      router.push(`/decks/${result.data.deckId}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Create Deck
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a deck</DialogTitle>
          <DialogDescription>
            Decks are extra practice built from items you have already learned. Practising a deck never changes your
            reviews or SRS progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Name</span>
            <Input
              className="mt-1"
              value={name}
              maxLength={DECK_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Description (optional)</span>
            <Textarea
              className="mt-1"
              rows={2}
              value={description}
              maxLength={DECK_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="text-sm">
            <p className="font-medium text-foreground">Items</p>
            <p className="mb-2 text-xs text-muted-foreground">Only items you have already learned can be added.</p>
            <DeckItemPicker
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              search={(query) => searchEligibleDeckItemsAction({ search: query })}
              emptyMessage="Nothing to add yet — finish a lesson and your items will show up here."
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending || selectedIds.length === 0}>
            Create deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
