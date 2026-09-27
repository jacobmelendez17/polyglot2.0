"use client";

import { useEffect, useMemo, useState } from "react";

import { useAppearance } from "@/lib/appearance/appearance-context";

export type DashboardChartColors = {
  vocabulary: string;
  grammar: string;
  primary: string;
  mutedText: string;
  gridLine: string;
  surface: string;
  border: string;
  fontFamily: string;
  /** Spec 20 Appearance — Color-Blind Assistance is on, so a chart with two
   * adjacent same-shape color fills and no per-segment label needs a
   * non-color cue. */
  colorBlindAssistance: boolean;
};

const CSS_VARS = {
  vocabulary: "--learning-vocabulary",
  grammar: "--learning-grammar",
  primary: "--primary",
  mutedText: "--muted-foreground",
  gridLine: "--grid-line",
  surface: "--card",
  border: "--border",
} as const;

/** A probe element resolves `var(...)` the browser's own way. Canvas fill/
 * stroke styles can't take a CSS custom property directly, unlike DOM/CSS. */
function resolveCssColor(cssVariable: string): string {
  if (typeof document === "undefined") return "transparent";
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVariable})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return resolved;
}

function resolveFontFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

/**
 * Resolves the dashboard chart palette from the app's semantic CSS tokens so
 * Chart.js — which paints to canvas and can't consume `var(...)` — stays in
 * sync with the live theme, accent palette, and font. Re-reads on every
 * relevant change: the appearance settings themselves, a `system` theme
 * following the OS preference, and (belt and suspenders) any class/data
 * attribute mutation `applyAppearanceToDocument` makes on `<html>`. Mirrors
 * the probe technique in `components/onboarding/lib/use-theme-tokens.ts`,
 * kept separate because that hook returns RGB triplets for gradient math and
 * this one only needs plain CSS color strings for Chart.js's fill/stroke/
 * font options.
 */
export function useDashboardChartColors(): DashboardChartColors {
  const { settings } = useAppearance();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-palette", "style"],
    });
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", bump);
    };
  }, []);

  return useMemo(
    () => ({
      vocabulary: resolveCssColor(CSS_VARS.vocabulary),
      grammar: resolveCssColor(CSS_VARS.grammar),
      primary: resolveCssColor(CSS_VARS.primary),
      mutedText: resolveCssColor(CSS_VARS.mutedText),
      gridLine: resolveCssColor(CSS_VARS.gridLine),
      surface: resolveCssColor(CSS_VARS.surface),
      border: resolveCssColor(CSS_VARS.border),
      fontFamily: resolveFontFamily(),
      colorBlindAssistance: settings.colorBlindAssistance,
    }),
    // `version` bumps on a DOM mutation (e.g. the system-theme media query
    // firing) to signal a re-read; it carries no value of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.theme, settings.palette, settings.colorBlindAssistance, version],
  );
}
