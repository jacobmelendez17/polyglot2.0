"use client";

import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createVocabularyGroupAction } from "@/app/(admin)/admin/curriculum/actions";

type CreateGroupDialogProps = {
  languageId: string;
  levels: { id: string; levelNumber: number }[];
  defaultLevelId?: string;
};

/** Spec 11 rewrite's "Vocabulary Groups / Themes" — a new group is appended after every existing group in its level (server-computed position, never guessed here). */
export function CreateGroupDialog({
  languageId,
  levels,
  defaultLevelId,
}: CreateGroupDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [levelId, setLevelId] = useState(defaultLevelId ?? levels[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (name.trim() === "") {
      setError("Enter a name for this group.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createVocabularyGroupAction({
        levelId,
        languageId,
        name,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setName("");
      router.push(`/admin/curriculum/groups/${result.data.groupId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a vocabulary group</DialogTitle>
          <DialogDescription>
            New groups are appended after the existing groups in the level.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Level</span>
            <Select value={levelId} onValueChange={setLevelId}>
              <SelectTrigger className="mt-1 w-full" aria-label="Level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    Level {level.levelNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Name</span>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
          <Button onClick={handleCreate} disabled={isPending}>
            Add group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
