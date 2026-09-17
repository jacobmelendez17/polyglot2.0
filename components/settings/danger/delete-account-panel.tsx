"use client";

import { useId, useState, useTransition } from "react";

import {
  cancelAccountDeletionAction,
  confirmAccountDeletionAction,
  requestAccountDeletionAction,
} from "@/app/(app)/settings/danger/actions";
import type { AccountDeletionStatus } from "@/app/(app)/settings/danger/actions";
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

const CONFIRMATION_PHRASE = "DELETE";

type DeleteAccountPanelProps = { initialStatus: AccountDeletionStatus };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Spec 20 Delete Account. Three states, driven entirely by server state
 * (`AccountDeletionStatus`) — never a client-only flag: "none" (the
 * initial "Send Delete Confirmation Email" button), "pending_confirmation"
 * (a request exists but is unconfirmed — see `account-deletion-
 * service.ts`'s docstring for why this step is a typed in-app
 * confirmation rather than an emailed link), and "pending_deletion" (the
 * spec's own "Your account is scheduled for deletion on [date]" mockup).
 */
export function DeleteAccountPanel({ initialStatus }: DeleteAccountPanelProps) {
  const [status, setStatus] = useState<AccountDeletionStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const result = await requestAccountDeletionAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStatus({
        status: "pending_confirmation",
        requestedAt: new Date(result.data.requestedAt),
      });
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmAccountDeletionAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStatus({
        status: "pending_deletion",
        deleteAfter: new Date(result.data.deleteAfter),
      });
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAccountDeletionAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStatus({ status: "none" });
    });
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Delete Account</h3>

      {error ? (
        <p role="alert" className="mt-1 text-sm text-state-error">
          {error}
        </p>
      ) : null}

      {status.status === "none" && (
        <RequestDeletionStep onRequest={handleRequest} isPending={isPending} />
      )}
      {status.status === "pending_confirmation" && (
        <PendingConfirmationStep
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isPending={isPending}
        />
      )}
      {status.status === "pending_deletion" && (
        <PendingDeletionStep
          deleteAfter={status.deleteAfter.toISOString()}
          onCancel={handleCancel}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function RequestDeletionStep({
  onRequest,
  isPending,
}: {
  onRequest: () => void;
  isPending: boolean;
}) {
  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently delete your Polyglot account.
      </p>
      <div className="mt-2">
        <Button variant="destructive" onClick={onRequest} disabled={isPending}>
          Start Account Deletion
        </Button>
      </div>
    </>
  );
}

function PendingConfirmationStep({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const isConfirmed = confirmationText === CONFIRMATION_PHRASE;

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        A deletion request is pending confirmation. Confirming starts your 7-day
        recovery period.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirmationText("");
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive">Confirm Account Deletion</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm account deletion?</DialogTitle>
              <DialogDescription>
                This starts a 7-day recovery period. Your account will be
                permanently deleted after that unless you cancel first — from
                your Settings, at any time before then.
              </DialogDescription>
            </DialogHeader>

            <label htmlFor={inputId} className="block text-sm">
              <span className="text-foreground">
                Type{" "}
                <span className="font-semibold">{CONFIRMATION_PHRASE}</span> to
                confirm
              </span>
              <Input
                id={inputId}
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                autoComplete="off"
                className="mt-1"
              />
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
                disabled={isPending || !isConfirmed}
              >
                Confirm Account Deletion
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel Request
        </Button>
      </div>
    </>
  );
}

function PendingDeletionStep({
  deleteAfter,
  onCancel,
  isPending,
}: {
  deleteAfter: string;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account is scheduled for deletion on {formatDate(deleteAfter)}.
      </p>
      <div className="mt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel Account Deletion
        </Button>
      </div>
    </>
  );
}
