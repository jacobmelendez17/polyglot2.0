import { useEffect, useMemo, useState } from "react";
import type { ThemeOptions } from "@mui/material/styles";

/**
 * Themes Material UI / React Admin from Polyglot's *semantic CSS variables*
 * (`app/globals.css`) rather than a second, hardcoded palette (spec 26 §3
 * "Visual and access integration"; ui-context.md "Colors").
 *
 * Two kinds of value are needed, for a reason that matters here:
 *
 * - **Palette colors are resolved** to concrete values read from the live
 *   document. MUI derives hover/disabled/ripple shades by *calculating* on a
 *   palette color (lighten, darken, alpha), which throws on a `var(--x)`
 *   string. Reading the computed value keeps the single source of truth in
 *   CSS while giving MUI something it can do arithmetic on.
 * - **Component styles use `var(--x)` directly**, so surfaces, borders, and
 *   radii follow a theme switch instantly through the cascade.
 *
 * The resolved values are re-read whenever `<html>`'s `class` (light/dark/
 * system) or `data-*` attributes (accent palette, font family/scale,
 * color-blind assistance) change, so the Appearance settings keep working
 * inside the Admin console.
 */

const TOKEN_NAMES = [
  "--bg-base",
  "--bg-surface",
  "--text-primary",
  "--text-muted",
  "--accent-primary",
  "--accent-foreground",
  "--accent-peach",
  "--border-default",
  "--state-error",
  "--state-success",
  "--state-warning",
] as const;

type TokenName = (typeof TOKEN_NAMES)[number];

export type PolyglotThemeSnapshot = {
  mode: "light" | "dark";
  /** A token is absent (not `""`) when it could not be resolved. */
  tokens: Partial<Record<TokenName, string>>;
  reducedMotion: boolean;
};

const EMPTY_SNAPSHOT: PolyglotThemeSnapshot = {
  mode: "light",
  tokens: {},
  reducedMotion: false,
};

export function readPolyglotThemeSnapshot(
  root: HTMLElement | null = typeof document === "undefined"
    ? null
    : document.documentElement,
): PolyglotThemeSnapshot {
  if (!root) return EMPTY_SNAPSHOT;
  const computed = getComputedStyle(root);
  const tokens: PolyglotThemeSnapshot["tokens"] = {};
  for (const name of TOKEN_NAMES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return {
    mode: root.classList.contains("dark") ? "dark" : "light",
    tokens,
    reducedMotion: reducedMotionQuery()?.matches ?? false,
  };
}

/** jsdom (and any very old browser) has no `matchMedia`; absence just means "no preference". */
function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
}

/** `{ main }` only when the token resolved, so a missing token falls back to MUI's default instead of breaking `createTheme`. */
function color(value: string | undefined, contrastText?: string) {
  if (!value) return undefined;
  return contrastText ? { main: value, contrastText } : { main: value };
}

export function buildPolyglotThemeOptions({
  mode,
  tokens,
  reducedMotion,
}: PolyglotThemeSnapshot): ThemeOptions {
  const t = tokens;
  const accent = t["--accent-primary"];

  return {
    palette: {
      mode,
      ...(accent ? { primary: color(accent, t["--accent-foreground"]) } : {}),
      // "Do not replace the palette with generic blue/purple SaaS colors"
      // (ui-context.md Visual Invariants): MUI's default secondary and info
      // are exactly those, so both are mapped onto Polyglot tokens.
      ...(t["--accent-peach"]
        ? { secondary: color(t["--accent-peach"], t["--text-primary"]) }
        : {}),
      ...(accent ? { info: color(accent, t["--accent-foreground"]) } : {}),
      ...(t["--state-error"] ? { error: color(t["--state-error"]) } : {}),
      ...(t["--state-success"] ? { success: color(t["--state-success"]) } : {}),
      ...(t["--state-warning"] ? { warning: color(t["--state-warning"]) } : {}),
      background: {
        ...(t["--bg-base"] ? { default: t["--bg-base"] } : {}),
        ...(t["--bg-surface"] ? { paper: t["--bg-surface"] } : {}),
      },
      text: {
        ...(t["--text-primary"] ? { primary: t["--text-primary"] } : {}),
        ...(t["--text-muted"] ? { secondary: t["--text-muted"] } : {}),
      },
      ...(t["--border-default"] ? { divider: t["--border-default"] } : {}),
    },
    typography: {
      // The handwritten UI font stays the primary voice (ui-context.md
      // Typography); `--font-sans` already resolves to whichever Appearance
      // Font Family the learner chose.
      fontFamily: "var(--font-sans), sans-serif",
      button: { textTransform: "none", fontWeight: 600 },
    },
    // ui-context.md Border Radius: buttons/inputs `rounded-lg` (= --radius),
    // cards `rounded-xl` (= 1.4 x --radius). `--radius` is declared on :root.
    shape: { borderRadius: 8 },
    ...(reducedMotion ? { transitions: { create: () => "none" } } : {}),
    components: {
      MuiButtonBase: { defaultProps: { disableRipple: reducedMotion } },
      MuiPaper: {
        styleOverrides: {
          // MUI's dark mode tints Paper with an elevation overlay; Polyglot's
          // surfaces are flat, warm, and border-defined instead.
          root: { backgroundImage: "none" },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: "1px solid var(--border-default)",
            borderRadius: "calc(var(--radius) * 1.4)",
            boxShadow: "none",
          },
        },
      },
      MuiButton: {
        styleOverrides: { root: { borderRadius: "var(--radius)" } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: "var(--radius)" } },
      },
    },
  };
}

const OBSERVED_ATTRIBUTES = [
  "class",
  "data-palette",
  "data-font-family",
  "data-font-scale",
  "data-color-blind",
];

function sameSnapshot(
  a: PolyglotThemeSnapshot,
  b: PolyglotThemeSnapshot,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * MUI theme options that track the document's live Polyglot theme. Returns a
 * new object only when a resolved value actually changed, so React Admin's
 * `ThemeProvider` (which rebuilds the MUI theme on identity change) does not
 * churn on unrelated attribute writes.
 */
export function usePolyglotThemeOptions(): ThemeOptions {
  const [snapshot, setSnapshot] = useState(() => readPolyglotThemeSnapshot());

  useEffect(() => {
    const update = () => {
      const next = readPolyglotThemeSnapshot();
      setSnapshot((previous) =>
        sameSnapshot(previous, next) ? previous : next,
      );
    };
    // The first read may have happened before Appearance applied the
    // learner's saved theme; re-read once mounted, then follow changes.
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES,
    });
    const motion = reducedMotionQuery();
    motion?.addEventListener("change", update);
    return () => {
      observer.disconnect();
      motion?.removeEventListener("change", update);
    };
  }, []);

  return useMemo(() => buildPolyglotThemeOptions(snapshot), [snapshot]);
}
