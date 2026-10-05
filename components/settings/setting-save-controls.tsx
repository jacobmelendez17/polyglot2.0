"use client";

import { Button } from "@/components/ui/button";

export type SettingSaveState = "idle" | "saving" | "saved" | "error";

type SettingSaveControlsProps = {
  /** Whether the field's draft value differs from what's actually applied. */
  isDirty: boolean;
  state: SettingSaveState;
  errorMessage?: string | null;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * The Save/Cancel row every Settings field shows — nothing takes effect until
 * Save is clicked (2026-09-28 user request, reversing spec 20 "Saving
 * Settings"'s original save-on-change design across the whole Settings
 * section). The row is always rendered and both buttons are disabled until the
 * draft differs from what's applied (2026-10-04 user request), so a field's
 * height never changes when a pending change appears or is saved. Keep the
 * button label constant for the same reason: "Saving…" lives in the status
 * text, not on the button, so nothing beside it shifts sideways either.
 */
export function SettingSaveControls({
  isDirty,
  state,
  errorMessage,
  onSave,
  onCancel,
}: SettingSaveControlsProps) {
  const isDisabled = !isDirty || state === "saving";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" onClick={onSave} disabled={isDisabled}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={isDisabled}
      >
        Cancel
      </Button>
      <p className="text-sm" aria-live="polite">
        {state === "saving" && (
          <span className="text-muted-foreground">Saving…</span>
        )}
        {isDirty && state === "error" && (
          <span className="text-destructive">
            {errorMessage ?? "Could not save setting."}
          </span>
        )}
        {!isDirty && state === "saved" && (
          <span className="text-state-success">Saved</span>
        )}
      </p>
    </div>
  );
}
