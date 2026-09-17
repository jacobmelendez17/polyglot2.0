"use client";

import { useId, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { EmailAddressResource } from "@clerk/shared/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getClerkErrorMessage } from "@/lib/clerk-error-message";

type Step = "idle" | "collecting-email" | "collecting-code";

/**
 * Spec 20 Account — Email. Clerk remains authoritative for login email; this
 * is a custom flow built on Clerk's client SDK rather than a second,
 * Polyglot-owned email/verification implementation:
 *
 * 1. `user.createEmailAddress` adds the candidate address to the account.
 * 2. `emailAddress.prepareVerification({ strategy: "email_code" })` sends
 *    the code.
 * 3. `emailAddress.attemptVerification({ code })` confirms it — the new
 *    address only becomes authoritative once this succeeds.
 * 4. `user.update({ primaryEmailAddressId })` + `user.reload()` make it
 *    primary and refresh the resource this component reads.
 *
 * No step here ever touches Neon — Clerk owns this identity entirely.
 */
export function EmailField() {
  const { user, isLoaded } = useUser();
  const inputId = useId();
  const [step, setStep] = useState<Step>("idle");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmailAddress, setPendingEmailAddress] =
    useState<EmailAddressResource | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justVerified, setJustVerified] = useState(false);

  function reset() {
    setStep("idle");
    setNewEmail("");
    setCode("");
    setPendingEmailAddress(null);
    setError(null);
  }

  async function handleSendCode() {
    if (!user) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const emailAddress = await user.createEmailAddress({ email: newEmail });
      await emailAddress.prepareVerification({ strategy: "email_code" });
      setPendingEmailAddress(emailAddress);
      setStep("collecting-code");
    } catch (err) {
      setError(
        getClerkErrorMessage(
          err,
          "Could not send a verification code. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!user || !pendingEmailAddress) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const verified = await pendingEmailAddress.attemptVerification({ code });
      await user.update({ primaryEmailAddressId: verified.id });
      await user.reload();
      setJustVerified(true);
      reset();
    } catch (err) {
      setError(
        getClerkErrorMessage(err, "That code didn't work. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isLoaded || !user) {
    return (
      <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
        <p className="text-sm font-medium text-foreground">Email</p>
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0">
        <div>
          <p className="text-sm font-medium text-foreground">Email</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.primaryEmailAddress?.emailAddress ?? "—"}
          </p>
          {justVerified && (
            <p className="mt-1 text-sm text-state-success" aria-live="polite">
              Saved
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setJustVerified(false);
            setStep("collecting-email");
          }}
        >
          Edit
        </Button>
      </div>
    );
  }

  if (step === "collecting-email") {
    return (
      <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          New email address
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id={inputId}
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            disabled={isSubmitting}
            autoFocus
            className="sm:max-w-xs"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSendCode}
              disabled={isSubmitting || !newEmail}
            >
              Send Verification Code
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        Verification code sent to {pendingEmailAddress?.emailAddress}
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={inputId}
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={isSubmitting}
          autoFocus
          className="sm:max-w-xs"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleVerify}
            disabled={isSubmitting || !code}
          >
            Verify
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
