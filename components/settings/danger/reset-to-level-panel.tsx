"use client";

import { useState, useTransition } from "react";

import { resetToLevelAction } from "@/app/(app)/settings/danger/actions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ResetToLevelPanelProps = {
  currentLevelNumber: number;
  /** Every Level the learner could reset to — strictly below the current Level (spec: "never offer a future locked Level"). Already sorted ascending. */
  earlierLevelNumbers: number[];
};

/**
 * Spec 20 Danger Zone — Reset to Level. The dropdown only ever offers
 * already-unlocked, strictly earlier Levels — there is no such thing as
 * "reset to the current Level" here, so the action stays disabled until a
 * real, earlier target is chosen (spec's own "disable the destructive
 * action until the learner selects an earlier Level").
 */
export function ResetToLevelPanel({ currentLevelNumber, earlierLevelNumbers }: ResetToLevelPanelProps) {
  const [target, setTarget] = useState<number | null>(earlierLevelNumbers.at(-1) ?? null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (earlierLevelNumbers.length === 0) {
    return (
      <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
        <h3 className="text-sm font-medium text-foreground">Reset to Level</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Current Level: Level {currentLevelNumber}. There is no earlier Level to reset to yet.
        </p>
      </div>
    );
  }

  function handleReset() {
    if (target === null) return;
    setError(null);
    startTransition(async () => {
      const result = await resetToLevelAction({ targetLevelNumber: target, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setSuccessMessage(`Reset to Level ${target}. ${result.data.affectedItemCount} item${result.data.affectedItemCount === 1 ? "" : "s"} removed.`);
    });
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Reset to Level</h3>
      <p className="mt-1 text-sm text-muted-foreground">Current Level: Level {currentLevelNumber}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={target !== null ? String(target) : undefined} onValueChange={(next) => setTarget(Number(next))}>
          <SelectTrigger className="w-40" aria-label="Reset to Level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {earlierLevelNumbers.map((levelNumber) => (
              <SelectItem key={levelNumber} value={String(levelNumber)}>
                Level {levelNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={target === null}>
              Reset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset to Level {target}?</DialogTitle>
              <DialogDescription>
                Removes your item progress and Level unlocks above Level {target}, including any Ghost Reviews tied to that
                progress. Your effective current Level becomes Level {target}.
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              Review history is kept — this does not fabricate or hide the fact that you studied the removed Levels.
            </p>

            {error ? (
              <p role="alert" className="text-sm text-state-error">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReset} disabled={isPending}>
                Confirm Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="mt-1 text-sm" aria-live="polite">
        {successMessage ? <span className="text-state-success">{successMessage}</span> : null}
      </p>
    </div>
  );
}
