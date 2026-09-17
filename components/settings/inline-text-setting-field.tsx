"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SaveState = "idle" | "saving" | "saved" | "error";

export type InlineTextSettingFieldResult =
  { ok: true; value: string | null } | { ok: false; message: string };

export type InlineTextSettingFieldProps = {
  label: string;
  initialValue: string | null;
  onSave: (value: string) => Promise<InlineTextSettingFieldResult>;
};

/**
 * A single free-text Settings field that saves immediately on submit (spec
 * 20 "Saving Settings"): collapsed view shows the current value with an
 * Add/Edit action; editing shows an input plus Save/Cancel; a failed save
 * returns to the last server-confirmed value rather than leaving an unsaved
 * draft looking successfully persisted. Shared by Name and Username
 * (`name-field.tsx`, `username-field.tsx`) — both are this same shape, only
 * the label and the Server Action they call differ.
 */
export function InlineTextSettingField({
  label,
  initialValue,
  onSave,
}: InlineTextSettingFieldProps) {
  const inputId = useId();
  const [savedValue, setSavedValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEditing() {
    setDraft(savedValue ?? "");
    setState("idle");
    setErrorMessage(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(savedValue ?? "");
    setState("idle");
    setErrorMessage(null);
    setIsEditing(false);
  }

  async function handleSave() {
    setState("saving");
    setErrorMessage(null);
    const result = await onSave(draft);

    if (!result.ok) {
      // Return to the last server-confirmed value rather than leaving the
      // draft looking saved (spec 20 "Saving Settings").
      setState("error");
      setErrorMessage(result.message);
      return;
    }

    setSavedValue(result.value);
    setState("saved");
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {savedValue ?? "—"}
          </p>
          {/* Stays visible until the learner edits again (startEditing resets `state`) — the spec's "Saving.../Saved" confirmation would otherwise never actually be seen, since success also collapses the editing form in the same render. */}
          {state === "saved" && (
            <p className="mt-1 text-sm text-state-success" aria-live="polite">
              Saved
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startEditing}
        >
          {savedValue ? "Edit" : "Add"}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
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
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={state === "saving"}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelEditing}
            disabled={state === "saving"}
          >
            Cancel
          </Button>
        </div>
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {state === "saving" && (
          <span className="text-muted-foreground">Saving…</span>
        )}
        {state === "saved" && <span className="text-state-success">Saved</span>}
        {state === "error" && (
          <span className="text-destructive">
            {errorMessage ?? "Could not save setting."}
          </span>
        )}
      </p>
    </div>
  );
}
