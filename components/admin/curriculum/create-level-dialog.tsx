"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { createLevelAction } from "@/app/(admin)/admin/curriculum/actions";

type CreateLevelDialogProps = { languageId: string };

/** Spec 11 rewrite's "Levels Management" — a new level starts in Draft with no curriculum attached; content is added afterward from the Curriculum page. */
export function CreateLevelDialog({ languageId }: CreateLevelDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [levelNumber, setLevelNumber] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    const parsed = Number(levelNumber);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Enter a valid level number.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createLevelAction({
        languageId,
        levelNumber: parsed,
        name: name.trim() === "" ? null : name,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setLevelNumber("");
      setName("");
      router.push(`/admin/curriculum/levels/${result.data.levelId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add level</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a level</DialogTitle>
          <DialogDescription>New levels start Draft until their curriculum is built out and published.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Level number</span>
            <Input className="mt-1" type="number" min={1} value={levelNumber} onChange={(e) => setLevelNumber(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Name (optional)</span>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
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
          <Button onClick={handleCreate} disabled={isPending}>
            Add level
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
