"use client";

import { useId } from "react";

import { Switch } from "@/components/ui/switch";
import { useAppearance } from "@/lib/appearance/appearance-context";

/**
 * Spec 20 Appearance — Color-Blind Assistance. The preview below mirrors
 * the spec's own worked examples exactly (◆ VOCAB / ■ GRAMMAR / ✓ Correct /
 * × Incorrect) — most of this app already pairs color with an icon and
 * text label unconditionally (`category-badge.tsx`'s Vocabulary/Grammar
 * badges, the review feedback region's Correct/Incorrect icon+text — a
 * pre-existing "never color alone" rule, not new with this setting).
 * `data-color-blind` (set by `applyAppearanceToDocument`) is the real hook
 * a genuinely color-only spot reads to add a *non-icon* cue instead — see
 * `components/dashboard/stacked-bar-chart.tsx`'s Vocabulary/Grammar
 * segments (a border-style difference) for a live instance.
 */
export function ColorBlindToggle() {
  const { settings, updateSettings } = useAppearance();
  const switchId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <label htmlFor={switchId} className="text-sm font-medium text-foreground">
            Color-Blind Assistance
          </label>
          <p className="mt-1 text-sm text-muted-foreground">Adds icons, labels, and stronger borders alongside color, never color alone.</p>
        </div>
        <Switch id={switchId} checked={settings.colorBlindAssistance} onCheckedChange={(value) => updateSettings({ colorBlindAssistance: value })} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-learning-vocabulary/20 px-2 py-1 text-learning-vocabulary">
            {settings.colorBlindAssistance && <span aria-hidden="true">◆</span>} Vocabulary
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-learning-grammar/20 px-2 py-1 text-learning-grammar">
            {settings.colorBlindAssistance && <span aria-hidden="true">■</span>} Grammar
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-state-success/20 px-2 py-1 text-state-success">
            {settings.colorBlindAssistance && <span aria-hidden="true">✓</span>} Correct
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-1 text-destructive">
            {settings.colorBlindAssistance && <span aria-hidden="true">×</span>} Incorrect
          </span>
        </div>
      </div>
    </div>
  );
}
