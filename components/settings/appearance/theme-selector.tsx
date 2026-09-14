"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { THEMES } from "@/lib/appearance/appearance-settings";
import type { Theme } from "@/lib/appearance/appearance-settings";

const LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Spec 20 Appearance — Theme. Applies immediately (no separate save step) — the same instant-persist behavior every other Settings control in this app already uses. */
export function ThemeSelector() {
  const { settings, updateSettings } = useAppearance();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Theme</legend>
      {THEMES.map((theme) => (
        <label key={theme} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm has-checked:border-primary has-checked:bg-accent/40">
          <input
            type="radio"
            name="appearance-theme"
            value={theme}
            checked={settings.theme === theme}
            onChange={() => updateSettings({ theme })}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-medium text-foreground">{LABELS[theme]}</span>
          {theme === "system" && <span className="text-muted-foreground">Follows your device setting</span>}
        </label>
      ))}
    </fieldset>
  );
}
