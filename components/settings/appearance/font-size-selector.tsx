"use client";

import { useAppearance } from "@/lib/appearance/appearance-context";
import { FONT_SCALES } from "@/lib/appearance/appearance-settings";
import type { FontScale } from "@/lib/appearance/appearance-settings";
import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import { useAppearanceDraft } from "@/components/settings/appearance/use-appearance-draft";

const LABELS: Record<FontScale, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  extra_large: "Extra Large",
};

/**
 * Spec 20 Appearance — Font Size. Picking an option only changes the local
 * draft — it has no effect on the live document until Save is clicked
 * (2026-09-28 user request, reversing this field's original apply-on-click
 * design). The preview below is real app typography (`text-2xl`/`text-base`)
 * driven by the root `html` font-size percentage (`globals.css`), which is
 * a genuinely global, `rem`-relative effect that can't be previewed inside
 * an isolated element the way `PaletteSelector`'s inline-styled box can —
 * it necessarily still shows the currently *applied* size, not the pending
 * pick, until Save is clicked.
 */
export function FontSizeSelector() {
  const { settings, updateSettings } = useAppearance();
  const { draft, isDirty, justSaved, setDraft, markSaved, reset } =
    useAppearanceDraft(settings.fontScale);

  function handleSave() {
    updateSettings({ fontScale: draft });
    markSaved();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FONT_SCALES.map((fontScale) => (
          <button
            key={fontScale}
            type="button"
            onClick={() => setDraft(fontScale)}
            aria-pressed={draft === fontScale}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              draft === fontScale ? "border-primary bg-accent/40" : "border-border"
            }`}
          >
            {LABELS[fontScale]}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-heading text-2xl font-semibold text-foreground">
          Example Header
        </p>
        <p className="mt-1 text-base text-foreground">
          This is normal Polyglot body text. It changes once the selected
          text size is saved.
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
