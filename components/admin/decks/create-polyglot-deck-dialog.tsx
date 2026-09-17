"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createPolyglotDeckAction,
  searchPublishedItemsAction,
} from "@/app/(admin)/admin/decks/actions";
import { DeckAvailabilityFields } from "@/components/admin/decks/deck-availability-fields";
import type { AdminDeckLevelOption } from "@/components/admin/decks/deck-availability-fields";
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
import {
  DECK_DESCRIPTION_MAX_LENGTH,
  DECK_NAME_MAX_LENGTH,
} from "@/domains/decks";
import type { DeckAvailability } from "@/domains/decks";

type CreatePolyglotDeckDialogProps = {
  languageId: string;
  levels: AdminDeckLevelOption[];
};

/** Creates an official Polyglot deck (spec 14's "Admin"). Like every deck, it cannot be created empty. */
export function CreatePolyglotDeckDialog({
  languageId,
  levels,
}: CreatePolyglotDeckDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [availability, setAvailability] = useState<{
    availability: DeckAvailability;
    gateLevelId: string | null;
  }>({
    availability: "theme",
    gateLevelId: null,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (name.trim().length === 0) {
      setError("Give the deck a name.");
      return;
    }
    if (availability.availability === "level" && !availability.gateLevelId) {
      setError("Choose the level that unlocks this deck.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createPolyglotDeckAction({
        languageId,
        name,
        description,
        learningItemIds: selectedIds,
        ...(availability.availability === "level"
          ? {
              availability: "level" as const,
              gateLevelId: availability.gateLevelId!,
            }
          : { availability: "theme" as const, gateLevelId: null }),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.push(`/admin/decks/${result.data.deckId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add deck</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a Polyglot deck</DialogTitle>
          <DialogDescription>
            Official decks reference published curriculum items. Learners can
            view and practice them but never change them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Name</span>
            <Input
              className="mt-1"
              value={name}
              maxLength={DECK_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">
              Description (optional)
            </span>
            <Textarea
              className="mt-1"
              rows={2}
              value={description}
              maxLength={DECK_DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <DeckAvailabilityFields
            availability={availability.availability}
            gateLevelId={availability.gateLevelId}
            levels={levels}
            onChange={setAvailability}
          />

          <div className="text-sm">
            <p className="font-medium text-foreground">Items</p>
            <DeckItemPicker
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              search={(query) =>
                searchPublishedItemsAction({ languageId, search: query })
              }
              emptyMessage="No published curriculum items match."
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
          <Button
            onClick={handleCreate}
            disabled={isPending || selectedIds.length === 0}
          >
            Add deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
