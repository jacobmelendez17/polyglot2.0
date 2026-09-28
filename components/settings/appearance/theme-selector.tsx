"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { THEMES } from "@/lib/appearance/appearance-settings";
import type { Theme } from "@/lib/appearance/appearance-settings";
import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import { useAppearanceDraft } from "@/components/settings/appearance/use-appearance-draft";

const LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Spec 20 Appearance — Theme. Picking an option only changes the local draft — it has no effect on the live document until Save is clicked (2026-09-28 user request, reversing this field's original apply-on-click design). */
export function ThemeSelector() {
  const { settings, updateSettings } = useAppearance();
  const { draft, isDirty, justSaved, setDraft, markSaved, reset } =
    useAppearanceDraft(settings.theme);

  function handleSave() {
    updateSettings({ theme: draft });
    markSaved();
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Theme</legend>
        {THEMES.map((theme) => (
          <label
            key={theme}
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm has-checked:border-primary has-checked:bg-accent/40"
          >
            <input
              type="radio"
              name="appearance-theme"
              value={theme}
              checked={draft === theme}
              onChange={() => setDraft(theme)}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-medium text-foreground">{LABELS[theme]}</span>
            {theme === "system" && (
              <span className="text-muted-foreground">
                Follows your device setting
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <SettingSaveControls
        isDirty={isDirty}
        state={justSaved ? "saved" : "idle"}
        onSave={handleSave}
        onCancel={reset}
      />
    </div>
  );
}
