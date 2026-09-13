"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";

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
import { getClerkErrorMessage } from "@/lib/clerk-error-message";

/**
 * Spec 20 Account — Password. Polyglot owns the modal UX; Clerk owns the
 * actual credential (`user.updatePassword`) — nothing here is ever sent to
 * or stored in Neon.
 *
 * "If the account does not currently use a password credential, use the
 * appropriate Clerk credential-management flow instead of presenting an
 * impossible old-password requirement": `user.passwordEnabled` decides
 * whether the Old Password field renders at all, and whether
 * `currentPassword` is even included in the request — Clerk's API accepts
 * `newPassword` alone for an account with no existing password credential.
 */
export function PasswordField() {
  const { user, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded || !user) {
    return (
      <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
        <p className="text-sm font-medium text-foreground">Password</p>
        <div className="mt-2 h-4 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    );
  }

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  async function handleSave() {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await user.updatePassword(
        user.passwordEnabled ? { currentPassword, newPassword } : { newPassword },
      );
      setOpen(false);
      resetForm();
    } catch (err) {
      setError(getClerkErrorMessage(err, "Could not change your password. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-foreground">Password</p>
        <p className="mt-1 text-sm text-muted-foreground">••••••••</p>
      </div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Your password is managed securely and is never stored by Polyglot.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {user.passwordEnabled && (
              <label className="block text-sm">
                <span className="font-medium text-foreground">Old Password</span>
                <Input
                  type="password"
                  className="mt-1"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium text-foreground">New Password</span>
              <Input
                type="password"
                className="mt-1"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">Confirm New Password</span>
              <Input
                type="password"
                className="mt-1"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSubmitting || !newPassword || !confirmPassword}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
