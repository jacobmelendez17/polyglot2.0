"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { FONT_FAMILIES } from "@/lib/appearance/appearance-settings";
import type { FontFamily } from "@/lib/appearance/appearance-settings";

const LABELS: Record<FontFamily, string> = {
  cozy: "Polyglot / Cozy",
  formal: "Formal",
  standard: "Standard",
};

// Matches globals.css's `[data-font-family]` variable names exactly, so
// each option previews in its own real font rather than a hardcoded stand-in.
const PREVIEW_STYLE: Record<FontFamily, React.CSSProperties> = {
  cozy: { fontFamily: "var(--font-cozy)" },
  formal: { fontFamily: "var(--font-formal)" },
  standard: { fontFamily: "var(--font-standard)" },
};

/** Spec 20 Appearance — Font Family. Every option must have solid glyph coverage for Polyglot's languages — Lora/Inter (`app/layout.tsx`) both load `latin`/`latin-ext` subsets, matching Cozy's own existing fallback discipline (`ui-context.md`'s "Language-Specific Typography"). */
export function FontFamilySelector() {
  const { settings, updateSettings } = useAppearance();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Font Family</legend>
      {FONT_FAMILIES.map((fontFamily) => (
        <label
          key={fontFamily}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 has-checked:border-primary has-checked:bg-accent/40"
        >
          <span className="flex items-center gap-3">
            <input
              type="radio"
              name="appearance-font-family"
              value={fontFamily}
              checked={settings.fontFamily === fontFamily}
              onChange={() => updateSettings({ fontFamily })}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm font-medium text-foreground">{LABELS[fontFamily]}</span>
          </span>
          <span className="text-base text-foreground" style={PREVIEW_STYLE[fontFamily]}>
            Aa Bb Cc
          </span>
        </label>
      ))}
    </fieldset>
  );
}
