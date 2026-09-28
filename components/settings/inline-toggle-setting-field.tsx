"use client";

import { useId, useState } from "react";

import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import type { SettingSaveState } from "@/components/settings/setting-save-controls";
import { Switch } from "@/components/ui/switch";

export type InlineToggleSettingFieldResult =
  { ok: true; value: boolean } | { ok: false; message: string };

export type InlineToggleSettingFieldProps = {
  label: string;
  description?: string;
  initialValue: boolean;
  onSave: (value: boolean) => Promise<InlineToggleSettingFieldResult>;
};

/**
 * A single boolean Settings field. Flipping the switch only changes the
 * local draft — it has no effect until Save is clicked (2026-09-28 user
 * request: every Settings card requires an explicit Save, reversing this
 * field's original spec 20 "Saving Settings" save-on-toggle design).
 * Cancel reverts the switch to the last applied value without saving.
 * Shared by every ordinary toggle across Settings (Hide English, NSFW,
 * Vacation Mode, Auto Pronunciation, Fluent Mode, and the seven Review UI
 * toggles).
 */
export function InlineToggleSettingField({
  label,
  description,
  initialValue,
  onSave,
}: InlineToggleSettingFieldProps) {
  const switchId = useId();
  const [savedValue, setSavedValue] = useState(initialValue);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [state, setState] = useState<SettingSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDirty = draftValue !== savedValue;

  function handleToggle(next: boolean) {
    setDraftValue(next);
    setState("idle");
    setErrorMessage(null);
  }

  function handleCancel() {
    setDraftValue(savedValue);
    setState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    setState("saving");
    setErrorMessage(null);
    const result = await onSave(draftValue);

    if (!result.ok) {
      setState("error");
      setErrorMessage(result.message);
      return;
    }

    setSavedValue(result.value);
    setDraftValue(result.value);
    setState("saved");
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label
            htmlFor={switchId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <Switch
          id={switchId}
          checked={draftValue}
          onCheckedChange={handleToggle}
          disabled={state === "saving"}
        />
      </div>
      <SettingSaveControls
        isDirty={isDirty}
        state={state}
        errorMessage={errorMessage}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
