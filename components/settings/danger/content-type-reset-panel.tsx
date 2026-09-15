"use client";

import { useState, useTransition } from "react";

import { resetContentTypeReviewsAction } from "@/app/(app)/settings/danger/actions";
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
import { RESET_TARGET_LABELS, RESET_TARGETS } from "@/domains/danger-zone";
import type { ResetTarget } from "@/domains/danger-zone";

type ContentTypeResetPanelProps = {
  contentType: "grammar" | "vocabulary";
};

const CONTENT_TYPE_LABELS: Record<"grammar" | "vocabulary", string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

/**
 * Spec 20 Danger Zone — "Reset Grammar"/"Reset Vocabulary" render this same
 * component with a different `contentType`, matching the underlying
 * `resetContentTypeReviews` service's own "one service, an item-type
 * filter" design ("do not implement separate unrelated reset logic for
 * vocabulary and grammar").
 */
function describeResetTarget(contentType: "grammar" | "vocabulary", target: ResetTarget): { what: string; retains: string } {
  const label = CONTENT_TYPE_LABELS[contentType];
  if (target === "ghost") {
    return {
      what: `Removes your active and dormant Ghost Reviews for ${label}.`,
      retains: `Your ${label} SRS stage and normal review schedule are not affected.`,
    };
  }
  if (target === "leech") {
    return {
      what: `Resets your Leech-classified ${label} items to Beginner 1.`,
      retains: "Review history is kept. Items not currently classified as Leeches are not affected.",
    };
  }
  if (target === "main") {
    return {
      what: `Resets all of your ${label} progress to Beginner 1.`,
      retains: "Review history, enrollment, notes, synonyms, and deck references are kept.",
    };
  }
  return {
    what: `Resets all ${target} ${label} progress to Beginner 1.`,
    retains: `${label} items outside ${target} are not affected. Review history is kept.`,
  };
}

export function ContentTypeResetPanel({ contentType }: ContentTypeResetPanelProps) {
  const [target, setTarget] = useState<ResetTarget>("main");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const description = describeResetTarget(contentType, target);
  const label = CONTENT_TYPE_LABELS[contentType];

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetContentTypeReviewsAction({ contentType, target, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setSuccessMessage(
        result.data.affectedItemCount === 0
          ? "No items matched — nothing was reset."
          : `Reset ${result.data.affectedItemCount} item${result.data.affectedItemCount === 1 ? "" : "s"}.`,
      );
    });
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Reset {label}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={target}
          onValueChange={(next) => {
            setTarget(next as ResetTarget);
            setSuccessMessage(null);
          }}
        >
          <SelectTrigger className="w-48" aria-label={`Reset ${label} option`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESET_TARGETS.map((option) => (
              <SelectItem key={option} value={option}>
                {RESET_TARGET_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">Reset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Reset {label} — {RESET_TARGET_LABELS[target]}?
              </DialogTitle>
              <DialogDescription>{description.what}</DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">{description.retains}</p>

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
