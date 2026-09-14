"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { PALETTES } from "@/lib/appearance/appearance-settings";
import type { Palette } from "@/lib/appearance/appearance-settings";

const LABELS: Record<Palette, string> = {
  sage: "Sage",
  ocean: "Ocean",
  amber: "Amber",
  plum: "Plum",
};

// Swatch colors mirror globals.css's `[data-palette]` overrides exactly, so
// the picker's own swatches show the true accent color for each option
// without needing to render an off-screen preview per swatch.
const SWATCH_COLORS: Record<Palette, string> = {
  sage: "#7FA69C",
  ocean: "#4A8FA0",
  amber: "#C98A3E",
  plum: "#9B6FA6",
};

/**
 * Spec 20 Appearance — Color Palette/Accent. Selecting a swatch applies it
 * immediately (`updateSettings` -> `applyAppearanceToDocument`), and the
 * "live miniature dashboard preview" below is real app chrome (`bg-primary`/
 * `bg-card` etc.), not a static mockup — it already reflects whichever
 * palette is current the instant a swatch is clicked, with no separate
 * preview-vs-commit state to keep in sync.
 */
export function PaletteSelector() {
  const { settings, updateSettings } = useAppearance();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {PALETTES.map((palette) => (
          <button
            key={palette}
            type="button"
            onClick={() => updateSettings({ palette })}
            aria-pressed={settings.palette === palette}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              settings.palette === palette ? "border-primary bg-accent/40" : "border-border"
            }`}
          >
            <span className="inline-block size-4 rounded-full" style={{ backgroundColor: SWATCH_COLORS[palette] }} aria-hidden="true" />
            {LABELS[palette]}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4">
        <div className="flex gap-3">
          <div className="h-12 flex-1 rounded-md bg-primary" />
          <div className="h-12 flex-[2] rounded-md bg-muted" />
        </div>
        <div className="mt-3 h-8 rounded-md bg-primary/20" />
        <p className="mt-3 text-xs text-muted-foreground">Preview — buttons, links, and highlights use this accent.</p>
      </div>
    </div>
  );
}
