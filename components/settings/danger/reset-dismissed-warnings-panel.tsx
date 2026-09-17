"use client";

import { useState, useTransition } from "react";

import { resetDismissedWarningsAction } from "@/app/(app)/settings/danger/actions";
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

/** Spec 20 Danger Zone — Reset Dismissable Warnings. */
export function ResetDismissedWarningsPanel() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetDismissedWarningsAction({
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setSuccessMessage(
        result.data.affectedItemCount === 0
          ? "You had no dismissed messages to reset."
          : `Reset ${result.data.affectedItemCount} dismissed message${result.data.affectedItemCount === 1 ? "" : "s"}.`,
      );
    });
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">
        Reset Dismissable Warnings
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Show all messages you previously marked “Don’t show this message again.”
      </p>

      <div className="mt-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">Reset Warnings</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset dismissed warnings?</DialogTitle>
              <DialogDescription>
                Every message you previously marked “Don’t show this message
                again” will be shown again. Nothing else about your account
                changes.
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
                onClick={handleReset}
                disabled={isPending}
              >
                Reset Warnings
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="mt-1 text-sm" aria-live="polite">
        {successMessage ? (
          <span className="text-state-success">{successMessage}</span>
        ) : null}
      </p>
    </div>
  );
}
