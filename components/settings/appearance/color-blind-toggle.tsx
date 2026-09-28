"use client";

import { useId } from "react";

import { Switch } from "@/components/ui/switch";
import { useAppearance } from "@/lib/appearance/appearance-context";
import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import { useAppearanceDraft } from "@/components/settings/appearance/use-appearance-draft";

/**
 * Spec 20 Appearance — Color-Blind Assistance. The preview below mirrors
 * the spec's own worked examples exactly (◆ VOCAB / ■ GRAMMAR / ✓ Correct /
 * × Incorrect) — most of this app already pairs color with an icon and
 * text label unconditionally (`category-badge.tsx`'s Vocabulary/Grammar
 * badges, the review feedback region's Correct/Incorrect icon+text — a
 * pre-existing "never color alone" rule, not new with this setting).
 * `settings.colorBlindAssistance` is the real signal a genuinely color-only
 * spot reads to add a *non-icon* cue instead — see
 * `components/dashboard/stacked-bar-chart.tsx`'s Vocabulary/Grammar
 * segments (a diagonal-stripe canvas fill pattern, since the 2026-09-27
 * Chart.js migration) for a live instance.
 *
 * Toggling only changes the local draft — it has no effect elsewhere in the
 * app until Save is clicked (2026-09-28 user request, reversing this
 * field's original apply-on-toggle design). This card's own preview icons
 * are self-contained, so they track the draft rather than freezing on the
 * currently-applied value.
 */
export function ColorBlindToggle() {
  const { settings, updateSettings } = useAppearance();
  const switchId = useId();
  const { draft, isDirty, justSaved, setDraft, markSaved, reset } =
    useAppearanceDraft(settings.colorBlindAssistance);

  function handleSave() {
    updateSettings({ colorBlindAssistance: draft });
    markSaved();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label
            htmlFor={switchId}
            className="text-sm font-medium text-foreground"
          >
            Color-Blind Assistance
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            Adds icons, labels, and stronger borders alongside color, never
            color alone.
          </p>
        </div>
        <Switch id={switchId} checked={draft} onCheckedChange={setDraft} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-learning-vocabulary/20 px-2 py-1 text-learning-vocabulary">
            {draft && <span aria-hidden="true">◆</span>} Vocabulary
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-learning-grammar/20 px-2 py-1 text-learning-grammar">
            {draft && <span aria-hidden="true">■</span>} Grammar
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-state-success/20 px-2 py-1 text-state-success">
            {draft && <span aria-hidden="true">✓</span>} Correct
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-1 text-destructive">
            {draft && <span aria-hidden="true">×</span>} Incorrect
          </span>
        </div>
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
