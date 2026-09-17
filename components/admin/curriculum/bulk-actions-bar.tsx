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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  bulkArchiveItemsAction,
  bulkMoveItemsAction,
  bulkPublishPendingItemsAction,
} from "@/app/(admin)/admin/curriculum/actions";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

type BulkActionsBarProps = {
  selectedItems: AdminCurriculumListItem[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  onDone: () => void;
};

/**
 * Spec 11 rewrite's "Bulk Actions" — Archive selected / Move to Level /
 * Move to group / Publish selected Pending items, each its own confirmation
 * before a transactional (all-or-nothing) server call. No bulk permanent-
 * delete, per the spec's own explicit prohibition.
 */
export function BulkActionsBar({
  selectedItems,
  levels,
  groups,
  onDone,
}: BulkActionsBarProps) {
  const router = useRouter();
  const count = selectedItems.length;
  const ids = selectedItems.map((item) => item.id);
  const allPending = selectedItems.every((item) => item.status === "pending");
  const hasGrammarItem = selectedItems.some((item) => item.type === "grammar");

  function refreshAndClear() {
    onDone();
    router.refresh();
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium text-foreground">
        {count} selected
      </span>
      <Button variant="ghost" size="sm" onClick={onDone}>
        Clear
      </Button>
      <div className="ml-auto flex flex-wrap gap-2">
        <BulkPublishDialog
          ids={ids}
          disabled={!allPending}
          onSuccess={refreshAndClear}
        />
        <BulkMoveDialog
          kind="level"
          ids={ids}
          levels={levels}
          groups={groups}
          onSuccess={refreshAndClear}
        />
        <BulkMoveDialog
          kind="group"
          ids={ids}
          levels={levels}
          groups={groups}
          hasGrammarItem={hasGrammarItem}
          onSuccess={refreshAndClear}
        />
        <BulkArchiveDialog ids={ids} onSuccess={refreshAndClear} />
      </div>
    </div>
  );
}

function BulkArchiveDialog({
  ids,
  onSuccess,
}: {
  ids: string[];
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await bulkArchiveItemsAction({
        learningItemIds: ids,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Archive selected
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Archive {ids.length} item{ids.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            Every selected item is archived together, or none are if anything
            fails.
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
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={isPending}
          >
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkPublishDialog({
  ids,
  disabled,
  onSuccess,
}: {
  ids: string[];
  disabled: boolean;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const result = await bulkPublishPendingItemsAction({
        learningItemIds: ids,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled}
          title={disabled ? "Every selected item must be Pending" : undefined}
        >
          Publish selected
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Publish {ids.length} item{ids.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            These items become visible to learners for the first time. All
            publish together, or none do.
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
          <Button onClick={handlePublish} disabled={isPending}>
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BulkMoveDialogProps = {
  kind: "level" | "group";
  ids: string[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  hasGrammarItem?: boolean;
  onSuccess: () => void;
};

function BulkMoveDialog({
  kind,
  ids,
  levels,
  groups,
  hasGrammarItem,
  onSuccess,
}: BulkMoveDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options =
    kind === "level"
      ? levels.map((l) => ({ id: l.id, label: `Level ${l.levelNumber}` }))
      : groups.map((g) => ({
          id: g.id,
          label: `L${g.levelNumber} — ${g.name}`,
        }));

  function handleMove() {
    if (!targetId) {
      setError(kind === "level" ? "Choose a level." : "Choose a group.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await bulkMoveItemsAction({
        learningItemIds: ids,
        idempotencyKey: crypto.randomUUID(),
        ...(kind === "level"
          ? { levelId: targetId }
          : { vocabularyGroupId: targetId }),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setTargetId("");
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Move to {kind === "level" ? "Level" : "group"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {ids.length} item{ids.length === 1 ? "" : "s"} to a{" "}
            {kind === "level" ? "level" : "group"}
          </DialogTitle>
          <DialogDescription>
            Existing learner progress remains associated with each item.
            {kind === "group" && hasGrammarItem
              ? " Grammar items in your selection have no group and won't be affected."
              : null}
          </DialogDescription>
        </DialogHeader>

        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger
            aria-label={kind === "level" ? "Target level" : "Target group"}
          >
            <SelectValue
              placeholder={
                kind === "level" ? "Choose a level" : "Choose a group"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={isPending}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
