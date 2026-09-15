"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { resetEntireAccountAction } from "@/app/(app)/settings/danger/actions";
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

const CONFIRMATION_PHRASE = "RESET";

/**
 * Spec 20 Danger Zone — Reset Entire Account. "Use a strong confirmation
 * dialog. Make the dialog clearly distinguish Reset Entire Account from
 * Delete Account" — the single most destructive per-account operation
 * short of Delete Account, so this gets a typed-confirmation phrase on
 * top of the ordinary confirm/cancel dialog every other Danger Zone
 * action here uses; a stronger client-side bar than the spec strictly
 * names, chosen deliberately for an operation this irreversible.
 */
export function ResetEntireAccountPanel() {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmationText === CONFIRMATION_PHRASE;

  function handleReset() {
    if (!isConfirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await resetEntireAccountAction({ idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Onboarding was reset to incomplete — the (app) layout's own
      // routing guard (`isOnboardingRequired`) sends any authenticated
      // page load back to /onboarding, so this is just the direct route.
      router.push("/onboarding");
    });
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Reset Entire Account</h3>
      <p className="mt-1 text-sm text-muted-foreground">Return your Polyglot learning account to a fresh state.</p>

      <div className="mt-2">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirmationText("");
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive">Reset Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Entire Account?</DialogTitle>
              <DialogDescription>
                This is different from Delete Account — your login, email, and password stay exactly as they are. Everything
                else about your Polyglot learning is removed: lesson and SRS progress, review history, Ghost Reviews, Level
                unlocks, every preference, personal decks, notes, synonyms, vacation history, streak adjustments, and your
                Polyglot username. You will need to complete onboarding again.
              </DialogDescription>
            </DialogHeader>

            <label htmlFor={inputId} className="block text-sm">
              <span className="text-foreground">
                Type <span className="font-semibold">{CONFIRMATION_PHRASE}</span> to confirm
              </span>
              <Input
                id={inputId}
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                autoComplete="off"
                className="mt-1"
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm text-state-error">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReset} disabled={isPending || !isConfirmed}>
                Reset Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
