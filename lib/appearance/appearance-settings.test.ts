import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE_SETTINGS, parseAppearanceSettings, resolvesToDark } from "./appearance-settings";

describe("parseAppearanceSettings", () => {
  it("returns the full default set for a non-object candidate", () => {
    expect(parseAppearanceSettings(null)).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    expect(parseAppearanceSettings(undefined)).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    expect(parseAppearanceSettings("not an object")).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });

  it("accepts a fully valid object as-is", () => {
    const value = { theme: "dark", palette: "plum", fontFamily: "formal", fontScale: "large", colorBlindAssistance: true };
    expect(parseAppearanceSettings(value)).toEqual(value);
  });

  it("falls back field-by-field for an invalid or missing field, rather than rejecting the whole object", () => {
    const result = parseAppearanceSettings({ theme: "dark", palette: "not-a-real-palette", colorBlindAssistance: true });
    expect(result).toEqual({
      theme: "dark",
      palette: DEFAULT_APPEARANCE_SETTINGS.palette,
      fontFamily: DEFAULT_APPEARANCE_SETTINGS.fontFamily,
      fontScale: DEFAULT_APPEARANCE_SETTINGS.fontScale,
      colorBlindAssistance: true,
    });
  });
});

describe("resolvesToDark", () => {
  it("dark is always dark, light is always light, regardless of the media query", () => {
    expect(resolvesToDark("dark", false)).toBe(true);
    expect(resolvesToDark("dark", true)).toBe(true);
    expect(resolvesToDark("light", true)).toBe(false);
    expect(resolvesToDark("light", false)).toBe(false);
  });

  it("system follows the media query", () => {
    expect(resolvesToDark("system", true)).toBe(true);
    expect(resolvesToDark("system", false)).toBe(false);
  });
});
