"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { FONT_SCALES } from "@/lib/appearance/appearance-settings";
import type { FontScale } from "@/lib/appearance/appearance-settings";

const LABELS: Record<FontScale, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  extra_large: "Extra Large",
};

/**
 * Spec 20 Appearance — Font Size. The preview below is real, live app
 * typography (`text-2xl`/`text-base`, the same classes every page already
 * uses) — since font scale is a root `html` font-size percentage
 * (`globals.css`), it already reflects the current selection the instant
 * it changes, without a separate preview-only rendering path.
 */
export function FontSizeSelector() {
  const { settings, updateSettings } = useAppearance();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FONT_SCALES.map((fontScale) => (
          <button
            key={fontScale}
            type="button"
            onClick={() => updateSettings({ fontScale })}
            aria-pressed={settings.fontScale === fontScale}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              settings.fontScale === fontScale ? "border-primary bg-accent/40" : "border-border"
            }`}
          >
            {LABELS[fontScale]}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-heading text-2xl font-semibold text-foreground">Example Header</p>
        <p className="mt-1 text-base text-foreground">This is normal Polyglot body text. It changes as the selected text size changes.</p>
      </div>
    </div>
  );
}
