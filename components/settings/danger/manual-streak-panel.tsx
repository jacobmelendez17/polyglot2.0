"use client";

import { useId, useState, useTransition } from "react";

import { setManualStreakAction } from "@/app/(app)/settings/danger/actions";
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

type ManualStreakPanelProps = {
  currentStreak: number;
};

/**
 * Spec 20 Danger Zone — Manually Set Streak. `currentStreak` (from
 * `getCurrentStreak`, the authoritative calculation) both labels the
 * current value and seeds the input's starting value — never recomputed
 * client-side, matching the spec's own "do not calculate the final streak
 * independently in dashboard React components."
 */
export function ManualStreakPanel({ currentStreak }: ManualStreakPanelProps) {
  const inputId = useId();
  const [value, setValue] = useState(String(currentStreak));
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedStreak, setSavedStreak] = useState<number | null>(null);

  const parsedValue = Number(value);
  const isValid =
    Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 100000;

  function handleSet() {
    if (!isValid) return;
    setError(null);
    startTransition(async () => {
      const result = await setManualStreakAction({
        value: parsedValue,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setSavedStreak(result.data.value);
    });
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">
        Manually Set Streak
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Current streak: {savedStreak ?? currentStreak}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          New streak value
        </label>
        <Input
          id={inputId}
          type="number"
          min={0}
          max={100000}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-24"
        />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={!isValid}>
              Set Streak
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Set streak to {isValid ? parsedValue : value}?
              </DialogTitle>
              <DialogDescription>
                This does not insert any fake review activity — it only sets a
                manual streak base. Your streak count will grow from this value
                on your next qualifying active day.
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
                onClick={handleSet}
                disabled={isPending || !isValid}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
