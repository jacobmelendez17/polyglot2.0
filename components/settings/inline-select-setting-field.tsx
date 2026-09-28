"use client";

import { useState } from "react";

import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import type { SettingSaveState } from "@/components/settings/setting-save-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type InlineSelectSettingFieldResult<T extends string> =
  { ok: true; value: T } | { ok: false; message: string };

export type InlineSelectSettingFieldProps<T extends string> = {
  label: string;
  description?: string;
  initialValue: T;
  options: { value: T; label: string }[];
  onSave: (value: T) => Promise<InlineSelectSettingFieldResult<T>>;
};

/**
 * A single small-enum Settings field, the `Select`-based counterpart to
 * `InlineToggleSettingField`. Choosing an option only changes the local
 * draft — it has no effect until Save is clicked (2026-09-28 user request:
 * every Settings card requires an explicit Save, reversing this field's
 * original spec 20 "Saving Settings" save-on-selection design). Cancel
 * reverts the `Select` to the last applied value without saving.
 */
export function InlineSelectSettingField<T extends string>({
  label,
  description,
  initialValue,
  options,
  onSave,
}: InlineSelectSettingFieldProps<T>) {
  const [savedValue, setSavedValue] = useState<T>(initialValue);
  const [draftValue, setDraftValue] = useState<T>(initialValue);
  const [state, setState] = useState<SettingSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDirty = draftValue !== savedValue;

  function handleChange(next: string) {
    setDraftValue(next as T);
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
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-2">
        <Select
          value={draftValue}
          onValueChange={handleChange}
          disabled={state === "saving"}
        >
          <SelectTrigger aria-label={label} className="w-full sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
