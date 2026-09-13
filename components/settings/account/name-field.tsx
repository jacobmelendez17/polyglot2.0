"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateNameAction } from "@/app/(app)/settings/account/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

type NameFieldProps = {
  initialName: string | null;
};

/**
 * Spec 20 Account — Name. Follows the spec's "Saving Settings" pattern: an
 * ordinary field saves immediately on submit, shows "Saving..." then
 * "Saved", and on failure returns the control to the last server-confirmed
 * value rather than leaving an unsaved value looking successfully persisted.
 */
export function NameField({ initialName }: NameFieldProps) {
  const inputId = useId();
  const [savedName, setSavedName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialName ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEditing() {
    setDraft(savedName ?? "");
    setState("idle");
    setErrorMessage(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(savedName ?? "");
    setState("idle");
    setErrorMessage(null);
    setIsEditing(false);
  }

  async function handleSave() {
    setState("saving");
    setErrorMessage(null);
    const result = await updateNameAction({ displayName: draft });

    if (!result.ok) {
      // Return to the last server-confirmed value rather than leaving the
      // draft looking saved (spec 20 "Saving Settings").
      setState("error");
      setErrorMessage(result.error.message);
      return;
    }

    setSavedName(result.data.displayName);
    setState("saved");
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0">
        <div>
          <p className="text-sm font-medium text-foreground">Name</p>
          <p className="mt-1 text-sm text-muted-foreground">{savedName ?? "—"}</p>
          {/* Stays visible until the learner edits again (startEditing resets `state`) — the spec's "Saving.../Saved" confirmation would otherwise never actually be seen, since success also collapses the editing form in the same render. */}
          {state === "saved" && (
            <p className="mt-1 text-sm text-state-success" aria-live="polite">
              Saved
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={startEditing}>
          {savedName ? "Edit" : "Add"}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        Name
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={state === "saving"}
          autoFocus
          className="sm:max-w-xs"
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={state === "saving"}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={state === "saving"}>
            Cancel
          </Button>
        </div>
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
        {state === "saved" && <span className="text-state-success">Saved</span>}
        {state === "error" && <span className="text-destructive">{errorMessage ?? "Could not save setting."}</span>}
      </p>
    </div>
  );
}
