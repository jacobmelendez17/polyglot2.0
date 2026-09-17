/**
 * Spec 20 Appearance — "the exception to the general server-settings rule."
 * Not authoritative learning data (never touches SRS/review/progress/
 * streak/authorization), so this whole module is deliberately
 * database-free and client-only — pure values/validation here, browser
 * storage in `appearance-storage.ts`, application in `appearance-context.tsx`.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "system";

export const PALETTES = ["sage", "ocean", "amber", "plum"] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = "sage";

/** Spec 20 Appearance — Font Family. "Polyglot / Cozy" (Shantell Sans, the app's existing default font) is the spec's own stated default. */
export const FONT_FAMILIES = ["cozy", "formal", "standard"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export const DEFAULT_FONT_FAMILY: FontFamily = "cozy";

/** Spec 20 Appearance — Font Size. Applied as a root font-size percentage, not a per-element pixel offset, so every existing `rem`-based Tailwind text/heading class scales together by the same ratio (spec: "using designed scaling ratios... not one identical pixel multiplier"). */
export const FONT_SCALES = [
  "small",
  "default",
  "large",
  "extra_large",
] as const;
export type FontScale = (typeof FONT_SCALES)[number];
export const DEFAULT_FONT_SCALE: FontScale = "default";

export const DEFAULT_COLOR_BLIND_ASSISTANCE = false;

export type AppearanceSettings = {
  theme: Theme;
  palette: Palette;
  fontFamily: FontFamily;
  fontScale: FontScale;
  colorBlindAssistance: boolean;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: DEFAULT_THEME,
  palette: DEFAULT_PALETTE,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontScale: DEFAULT_FONT_SCALE,
  colorBlindAssistance: DEFAULT_COLOR_BLIND_ASSISTANCE,
};

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

export function isPalette(value: unknown): value is Palette {
  return (
    typeof value === "string" && (PALETTES as readonly string[]).includes(value)
  );
}

export function isFontFamily(value: unknown): value is FontFamily {
  return (
    typeof value === "string" &&
    (FONT_FAMILIES as readonly string[]).includes(value)
  );
}

export function isFontScale(value: unknown): value is FontScale {
  return (
    typeof value === "string" &&
    (FONT_SCALES as readonly string[]).includes(value)
  );
}

/**
 * Accepts a loosely-typed candidate (parsed JSON, of unknown shape) and
 * returns a fully valid `AppearanceSettings`, falling back field-by-field to
 * the default rather than rejecting the whole object — a value written by a
 * future app version with one new/renamed field should not blank out the
 * four fields it still recognizes.
 */
export function parseAppearanceSettings(
  candidate: unknown,
): AppearanceSettings {
  if (typeof candidate !== "object" || candidate === null)
    return DEFAULT_APPEARANCE_SETTINGS;
  const value = candidate as Record<string, unknown>;
  return {
    theme: isTheme(value.theme) ? value.theme : DEFAULT_THEME,
    palette: isPalette(value.palette) ? value.palette : DEFAULT_PALETTE,
    fontFamily: isFontFamily(value.fontFamily)
      ? value.fontFamily
      : DEFAULT_FONT_FAMILY,
    fontScale: isFontScale(value.fontScale)
      ? value.fontScale
      : DEFAULT_FONT_SCALE,
    colorBlindAssistance:
      typeof value.colorBlindAssistance === "boolean"
        ? value.colorBlindAssistance
        : DEFAULT_COLOR_BLIND_ASSISTANCE,
  };
}

/** Whether `theme` currently resolves to a dark surface — `system` follows `prefers-color-scheme` (spec's own explicit rule). Takes the media-query result as a parameter rather than reading `window` itself, so it stays usable in the no-flash bootstrap script (which inlines its own tiny copy of this same rule, see `appearance-bootstrap.ts`) and in tests alike. */
export function resolvesToDark(
  theme: Theme,
  prefersDarkMediaQuery: boolean,
): boolean {
  return theme === "dark" || (theme === "system" && prefersDarkMediaQuery);
}
