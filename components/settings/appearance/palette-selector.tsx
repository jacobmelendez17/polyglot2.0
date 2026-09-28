"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { PALETTES } from "@/lib/appearance/appearance-settings";
import type { Palette } from "@/lib/appearance/appearance-settings";
import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import { useAppearanceDraft } from "@/components/settings/appearance/use-appearance-draft";

const LABELS: Record<Palette, string> = {
  sage: "Sage",
  ocean: "Ocean",
  amber: "Amber",
  plum: "Plum",
};

// Swatch colors mirror globals.css's `[data-palette]` overrides exactly, so
// the picker's own swatches (and, now, the preview box below) show the true
// accent color for each option without needing to actually apply it first.
const SWATCH_COLORS: Record<Palette, string> = {
  sage: "#7FA69C",
  ocean: "#4A8FA0",
  amber: "#C98A3E",
  plum: "#9B6FA6",
};

/**
 * Spec 20 Appearance — Color Palette/Accent. Picking a swatch only changes
 * the local draft — it has no effect on the live document until Save is
 * clicked (2026-09-28 user request, reversing this field's original
 * apply-on-click design). The preview box below is inline-styled from
 * `SWATCH_COLORS` rather than the live `bg-primary`/`bg-card` utility
 * classes it used to use, specifically so it can keep tracking the *draft*
 * pick instead of freezing on whatever palette is currently applied.
 */
export function PaletteSelector() {
  const { settings, updateSettings } = useAppearance();
  const { draft, isDirty, justSaved, setDraft, markSaved, reset } =
    useAppearanceDraft(settings.palette);

  function handleSave() {
    updateSettings({ palette: draft });
    markSaved();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {PALETTES.map((palette) => (
          <button
            key={palette}
            type="button"
            onClick={() => setDraft(palette)}
            aria-pressed={draft === palette}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              draft === palette
                ? "border-primary bg-accent/40"
                : "border-border"
            }`}
          >
            <span
              className="inline-block size-4 rounded-full"
              style={{ backgroundColor: SWATCH_COLORS[palette] }}
              aria-hidden="true"
            />
            {LABELS[palette]}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4">
        <div className="flex gap-3">
          <div
            className="h-12 flex-1 rounded-md"
            style={{ backgroundColor: SWATCH_COLORS[draft] }}
          />
          <div className="h-12 flex-[2] rounded-md bg-muted" />
        </div>
        <div
          className="mt-3 h-8 rounded-md"
          style={{ backgroundColor: `${SWATCH_COLORS[draft]}33` }}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Preview — buttons, links, and highlights use this accent.
        </p>
      </div>

      <SettingSaveControls
        isDirty={isDirty}
        state={justSaved ? "saved" : "idle"}
        onSave={handleSave}
        onCancel={reset}
      />
    </div>
  );
}
