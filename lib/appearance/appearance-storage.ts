import { DEFAULT_APPEARANCE_SETTINGS, parseAppearanceSettings, resolvesToDark } from "./appearance-settings";
import type { AppearanceSettings } from "./appearance-settings";

/** Spec 20 Appearance — "a versioned browser-storage key such as polyglot:appearance:v1." Bump the suffix, not the shape, if a future breaking change needs a clean slate rather than `parseAppearanceSettings`'s field-by-field fallback. */
export const APPEARANCE_STORAGE_KEY = "polyglot:appearance:v1";

/** Never throws — private browsing, disabled storage, or a corrupt value all just fall back to the defaults rather than breaking the page. */
export function readAppearanceSettings(): AppearanceSettings {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return raw ? parseAppearanceSettings(JSON.parse(raw)) : DEFAULT_APPEARANCE_SETTINGS;
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
}

/** Never throws — a write failure (quota, disabled storage) just means this session's change doesn't persist, not a broken page. */
export function writeAppearanceSettings(settings: AppearanceSettings): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Intentionally silent — see docstring.
  }
}

/**
 * Applies settings to the document (spec 20: "CSS variables, data
 * attributes, document class... Do not add individual appearance
 * conditionals throughout application components"). Every component reads
 * these through `globals.css`'s `.dark`/`[data-palette]`/
 * `[data-font-family]`/`[data-font-scale]`/`[data-color-blind]` selectors —
 * nothing here is component-specific.
 */
export function applyAppearanceToDocument(settings: AppearanceSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", resolvesToDark(settings.theme, prefersDark));
  root.setAttribute("data-palette", settings.palette);
  root.setAttribute("data-font-family", settings.fontFamily);
  root.setAttribute("data-font-scale", settings.fontScale);
  root.setAttribute("data-color-blind", String(settings.colorBlindAssistance));
}
