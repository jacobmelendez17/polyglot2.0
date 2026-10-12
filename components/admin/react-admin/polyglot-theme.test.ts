import { act, renderHook, waitFor } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPolyglotThemeOptions,
  readPolyglotThemeSnapshot,
  usePolyglotThemeOptions,
  type PolyglotThemeSnapshot,
} from "./polyglot-theme";

const LIGHT_TOKENS = {
  "--bg-base": "#f8efe7",
  "--bg-surface": "#ffffff",
  "--text-primary": "#3e4440",
  "--text-muted": "#97938a",
  "--accent-primary": "#7fa69c",
  "--accent-foreground": "#27322e",
  "--accent-peach": "#ebc4b4",
  "--border-default": "#e1d4c2",
  "--state-error": "#be7068",
  "--state-success": "#6f9b7f",
  "--state-warning": "#d4a85f",
} as const;

const DARK_ACCENT = "#8db5aa";

function setTokens(tokens: Record<string, string>) {
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value);
  }
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-palette");
});

describe("readPolyglotThemeSnapshot", () => {
  it("reads the live CSS variables the app already defines", () => {
    setTokens(LIGHT_TOKENS);
    const snapshot = readPolyglotThemeSnapshot();
    expect(snapshot.tokens["--accent-primary"]).toBe("#7fa69c");
    expect(snapshot.tokens["--bg-base"]).toBe("#f8efe7");
    expect(snapshot.mode).toBe("light");
  });

  it("detects dark mode from the document's `dark` class, as Appearance applies it", () => {
    document.documentElement.classList.add("dark");
    expect(readPolyglotThemeSnapshot().mode).toBe("dark");
  });

  it("omits a token that is not defined instead of inventing a value", () => {
    const snapshot = readPolyglotThemeSnapshot();
    expect(snapshot.tokens).toEqual({});
  });
});

describe("buildPolyglotThemeOptions", () => {
  const light: PolyglotThemeSnapshot = {
    mode: "light",
    tokens: LIGHT_TOKENS,
    reducedMotion: false,
  };

  it("maps Polyglot's semantic tokens onto the MUI palette", () => {
    const { palette } = buildPolyglotThemeOptions(light);
    expect(palette?.mode).toBe("light");
    expect(palette?.primary).toEqual({
      main: "#7fa69c",
      contrastText: "#27322e",
    });
    expect(palette?.background).toEqual({
      default: "#f8efe7",
      paper: "#ffffff",
    });
    expect(palette?.text).toEqual({
      primary: "#3e4440",
      secondary: "#97938a",
    });
    expect(palette?.divider).toBe("#e1d4c2");
    expect(palette?.error).toEqual({ main: "#be7068" });
  });

  it("replaces MUI's default purple secondary and blue info with Polyglot tokens", () => {
    const { palette } = buildPolyglotThemeOptions(light);
    expect(palette?.secondary).toMatchObject({ main: "#ebc4b4" });
    expect(palette?.info).toMatchObject({ main: "#7fa69c" });
  });

  it("follows the accent palette: a different --accent-primary changes primary", () => {
    const { palette } = buildPolyglotThemeOptions({
      ...light,
      mode: "dark",
      tokens: { ...LIGHT_TOKENS, "--accent-primary": DARK_ACCENT },
    });
    expect(palette?.mode).toBe("dark");
    expect(palette?.primary).toMatchObject({ main: DARK_ACCENT });
  });

  it("leaves MUI's defaults alone for tokens that did not resolve", () => {
    const { palette } = buildPolyglotThemeOptions({
      mode: "light",
      tokens: {},
      reducedMotion: false,
    });
    expect(palette).not.toHaveProperty("primary");
    expect(palette).not.toHaveProperty("secondary");
    expect(palette).not.toHaveProperty("divider");
  });

  it("uses the app's handwritten font stack via --font-sans", () => {
    expect(buildPolyglotThemeOptions(light).typography).toMatchObject({
      fontFamily: expect.stringContaining("var(--font-sans)"),
    });
  });

  it("styles surfaces with var() so a theme switch needs no rebuild", () => {
    const { components } = buildPolyglotThemeOptions(light);
    expect(JSON.stringify(components?.MuiCard?.styleOverrides)).toContain(
      "var(--border-default)",
    );
  });

  it("drops MUI's dark-mode elevation tint on surfaces", () => {
    const { components } = buildPolyglotThemeOptions({
      ...light,
      mode: "dark",
    });
    expect(components?.MuiPaper?.styleOverrides).toEqual({
      root: { backgroundImage: "none" },
    });
  });

  it("removes transitions and ripples under reduced motion", () => {
    const reduced = buildPolyglotThemeOptions({
      ...light,
      reducedMotion: true,
    });
    expect(reduced.transitions?.create).toBeTypeOf("function");
    expect((reduced.transitions!.create as () => string)()).toBe("none");
    expect(reduced.components?.MuiButtonBase?.defaultProps).toEqual({
      disableRipple: true,
    });

    const normal = buildPolyglotThemeOptions(light);
    expect(normal.transitions).toBeUndefined();
    expect(normal.components?.MuiButtonBase?.defaultProps).toEqual({
      disableRipple: false,
    });
  });

  it.each([
    ["full light", light],
    ["full dark", { ...light, mode: "dark" as const }],
    ["empty", { mode: "light" as const, tokens: {}, reducedMotion: false }],
    ["reduced motion", { ...light, reducedMotion: true }],
  ])("produces options MUI can build a theme from (%s)", (_name, snapshot) => {
    expect(() =>
      createTheme(buildPolyglotThemeOptions(snapshot)),
    ).not.toThrow();
  });
});

describe("usePolyglotThemeOptions", () => {
  it("starts from the document's current theme", () => {
    setTokens(LIGHT_TOKENS);
    const { result } = renderHook(() => usePolyglotThemeOptions());
    expect(result.current.palette?.mode).toBe("light");
    expect(result.current.palette?.primary).toMatchObject({ main: "#7fa69c" });
  });

  it("follows a light/dark switch made elsewhere in the app", async () => {
    setTokens(LIGHT_TOKENS);
    const { result } = renderHook(() => usePolyglotThemeOptions());
    expect(result.current.palette?.mode).toBe("light");

    act(() => {
      document.documentElement.classList.add("dark");
    });

    await waitFor(() => expect(result.current.palette?.mode).toBe("dark"));
  });

  it("follows an accent-palette switch (the data-palette attribute)", async () => {
    setTokens(LIGHT_TOKENS);
    const { result } = renderHook(() => usePolyglotThemeOptions());

    act(() => {
      setTokens({ "--accent-primary": "#5b8fb0" });
      document.documentElement.setAttribute("data-palette", "ocean");
    });

    await waitFor(() =>
      expect(result.current.palette?.primary).toMatchObject({
        main: "#5b8fb0",
      }),
    );
  });

  it("keeps the same object when an unrelated attribute changes", async () => {
    setTokens(LIGHT_TOKENS);
    const { result } = renderHook(() => usePolyglotThemeOptions());
    const before = result.current;

    act(() => {
      document.documentElement.setAttribute("data-font-scale", "large");
    });
    // Let the observer's microtask run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(before);
  });
});
