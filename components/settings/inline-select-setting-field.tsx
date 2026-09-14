"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SaveState = "idle" | "saving" | "saved" | "error";

export type InlineSelectSettingFieldResult<T extends string> = { ok: true; value: T } | { ok: false; message: string };

export type InlineSelectSettingFieldProps<T extends string> = {
  label: string;
  description?: string;
  initialValue: T;
  options: { value: T; label: string }[];
  onSave: (value: T) => Promise<InlineSelectSettingFieldResult<T>>;
};

/**
 * A single small-enum Settings field that saves immediately on selection
 * (spec 20 "Saving Settings"), the `Select`-based counterpart to
 * `InlineToggleSettingField`. Optimistically switches, then reverts and
 * shows the server's message if the save fails. Extracted once a second
 * field (Lesson Batch Size) needed the exact same shape as the first
 * (Grammar Placement) — the same rule of thumb that produced
 * `InlineTextSettingField`.
 */
export function InlineSelectSettingField<T extends string>({ label, description, initialValue, options, onSave }: InlineSelectSettingFieldProps<T>) {
  const [value, setValue] = useState<T>(initialValue);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleChange(next: string) {
    const previous = value;
    const nextValue = next as T;
    setValue(nextValue);
    setState("saving");
    setErrorMessage(null);

    const result = await onSave(nextValue);

    if (!result.ok) {
      setValue(previous);
      setState("error");
      setErrorMessage(result.message);
      return;
    }
    setValue(result.value);
    setState("saved");
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-2">
        <Select value={value} onValueChange={handleChange} disabled={state === "saving"}>
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
      <p className="mt-2 text-sm" aria-live="polite">
        {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
        {state === "saved" && <span className="text-state-success">Saved</span>}
        {state === "error" && <span className="text-destructive">{errorMessage ?? "Could not save setting."}</span>}
      </p>
    </div>
  );
}
