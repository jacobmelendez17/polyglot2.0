"use client";

import { ColorBlindToggle } from "@/components/settings/appearance/color-blind-toggle";
import { FontFamilySelector } from "@/components/settings/appearance/font-family-selector";
import { FontSizeSelector } from "@/components/settings/appearance/font-size-selector";
import { PaletteSelector } from "@/components/settings/appearance/palette-selector";
import { ThemeSelector } from "@/components/settings/appearance/theme-selector";

/**
 * Spec 20 Appearance — "the exception to the general server-settings rule."
 * Every control on this page reads/writes `lib/appearance`'s localStorage-
 * backed `AppearanceProvider` directly; nothing here touches the database,
 * a Server Action, or any authoritative learning data (SRS, review
 * eligibility, curriculum, progress, streak, authorization are all
 * untouched by this whole page by construction). A client component page
 * for that reason — there is no server data to fetch.
 */
export default function AppearanceSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Theme
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stored on this device — it does not sync between devices.
        </p>
        <div className="mt-4">
          <ThemeSelector />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Color Palette
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes the accent used for buttons, links, and highlights — never the
          meaning-bearing colors for Vocabulary, Grammar, or SRS stages.
        </p>
        <div className="mt-4">
          <PaletteSelector />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Font Family
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Polyglot / Cozy is the default written/handwritten style.
        </p>
        <div className="mt-4">
          <FontFamilySelector />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Font Size
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scales body text, headings, and labels together.
        </p>
        <div className="mt-4">
          <FontSizeSelector />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Accessibility
        </h2>
        <div className="mt-4">
          <ColorBlindToggle />
        </div>
      </div>
    </div>
  );
}
