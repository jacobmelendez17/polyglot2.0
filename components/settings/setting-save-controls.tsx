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
 * The Save/Cancel row every Settings field shows once its draft value
 * differs from what's actually applied — nothing takes effect until Save is
 * clicked (2026-09-28 user request, reversing spec 20 "Saving Settings"'s
 * original save-on-change design across the whole Settings section). Renders
 * nothing when there's no pending change and nothing to report, so a field
 * that's never been touched takes no extra vertical space.
 */
export function SettingSaveControls({
  isDirty,
  state,
  errorMessage,
  onSave,
  onCancel,
}: SettingSaveControlsProps) {
  if (!isDirty && state !== "saved") return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {isDirty && (
        <>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={state === "saving"}
          >
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={state === "saving"}
          >
            Cancel
          </Button>
        </>
      )}
      <p className="text-sm" aria-live="polite">
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
