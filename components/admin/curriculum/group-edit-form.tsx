"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { updateVocabularyGroupAction } from "@/app/(admin)/admin/curriculum/actions";
import type { CurriculumStatus } from "@/domains/curriculum";

type GroupEditFormProps = {
  groupId: string;
  name: string;
  status: CurriculumStatus;
};

const STATUS_OPTIONS: CurriculumStatus[] = ["draft", "pending", "published", "archived"];

/** Spec 11 rewrite's "Vocabulary Groups / Themes" edit surface. Archiving specifically gets a confirmation step (an existing themed group leaving active rotation is a meaningful change); every other name/status edit saves directly. */
export function GroupEditForm({ groupId, name: initialName, status: initialStatus }: GroupEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<CurriculumStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function save(finalStatus: CurriculumStatus) {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await updateVocabularyGroupAction({ groupId, name, status: finalStatus, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setConfirmingArchive(false);
      setJustSaved(true);
      router.refresh();
    });
  }

  function handleSubmit() {
    if (name.trim() === "") {
      setError("Enter a name for this group.");
      return;
    }
    if (status === "archived" && initialStatus !== "archived") {
      setError(null);
      setConfirmingArchive(true);
      return;
    }
    save(status);
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="max-w-md space-y-4"
      >
        <label className="block text-sm">
          <span className="font-medium text-foreground">Name</span>
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJustSaved(false);
            }}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-foreground">Status</span>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as CurriculumStatus);
              setJustSaved(false);
            }}
          >
            <SelectTrigger className="mt-1 w-full" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option[0]!.toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            Save
          </Button>
          {justSaved ? (
            <span className="flex items-center gap-1 text-sm text-state-success">
              <Check className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </div>
      </form>

      <Dialog open={confirmingArchive} onOpenChange={setConfirmingArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive &ldquo;{initialName}&rdquo;?</DialogTitle>
            <DialogDescription>
              Archived groups stay on record but are no longer active for new curriculum. Existing vocabulary items keep their group assignment.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-state-error">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingArchive(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => save("archived")} disabled={isPending}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
