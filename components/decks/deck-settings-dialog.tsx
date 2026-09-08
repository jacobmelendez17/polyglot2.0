"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { updateDeckDetailsAction } from "@/app/(app)/decks/actions";
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

type DeckSettingsDialogProps = {
  deckId: string;
  name: string;
  description: string | null;
};

/** Rename and re-describe a personal deck (spec 14's "rename" / "edit description"). */
export function DeckSettingsDialog({ deckId, name, description }: DeckSettingsDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [descriptionDraft, setDescriptionDraft] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (nameDraft.trim().length === 0) {
      setError("Give your deck a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateDeckDetailsAction({ deckId, name: nameDraft, description: descriptionDraft });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setNameDraft(name);
          setDescriptionDraft(description ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deck details</DialogTitle>
          <DialogDescription>Rename this deck or change its description.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Name</span>
            <Input
              className="mt-1"
              value={nameDraft}
              maxLength={DECK_NAME_MAX_LENGTH}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Description (optional)</span>
            <Textarea
              className="mt-1"
              rows={3}
              value={descriptionDraft}
              maxLength={DECK_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescriptionDraft(event.target.value)}
            />
          </label>
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
          <Button onClick={handleSave} disabled={isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
