"use client";

import { useId, useState } from "react";

import { Switch } from "@/components/ui/switch";

type SaveState = "idle" | "saving" | "saved" | "error";

export type InlineToggleSettingFieldResult = { ok: true; value: boolean } | { ok: false; message: string };

export type InlineToggleSettingFieldProps = {
  label: string;
  description?: string;
  initialValue: boolean;
  onSave: (value: boolean) => Promise<InlineToggleSettingFieldResult>;
};

/**
 * A single boolean Settings field that saves immediately on toggle (spec 20
 * "Saving Settings"). Optimistically flips, then reverts and shows the
 * server's message if the save fails — never leaves an unsaved toggle
 * position looking successfully persisted. Shared by every ordinary
 * toggle across Settings (Hide English, NSFW, and — as later units land —
 * Vacation Mode, autoplay, lightning mode, and the rest of Review UI's
 * toggle-shaped preferences), not built speculatively: the spec names more
 * than a dozen fields with this exact shape.
 */
export function InlineToggleSettingField({ label, description, initialValue, onSave }: InlineToggleSettingFieldProps) {
  const switchId = useId();
  const [checked, setChecked] = useState(initialValue);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    const previous = checked;
    setChecked(next);
    setState("saving");
    setErrorMessage(null);

    const result = await onSave(next);

    if (!result.ok) {
      setChecked(previous);
      setState("error");
      setErrorMessage(result.message);
      return;
    }

    setChecked(result.value);
    setState("saved");
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0">
      <div>
        <label htmlFor={switchId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <p className="mt-1 text-sm" aria-live="polite">
          {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
          {state === "saved" && <span className="text-state-success">Saved</span>}
          {state === "error" && <span className="text-destructive">{errorMessage ?? "Could not save setting."}</span>}
        </p>
      </div>
      <Switch id={switchId} checked={checked} onCheckedChange={handleChange} disabled={state === "saving"} />
    </div>
  );
}
