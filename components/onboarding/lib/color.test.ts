import { describe, expect, it } from "vitest";

import { mixRGB, parseComputedColor } from "./color";

describe("parseComputedColor", () => {
  it("reads rgb() and rgba()", () => {
    expect(parseComputedColor("rgb(127, 166, 155)")).toEqual([127, 166, 155]);
    expect(parseComputedColor("rgba(62, 68, 64, 0.5)")).toEqual([62, 68, 64]);
  });

  it("reads color(srgb …), which is what color-mix() resolves to", () => {
    expect(parseComputedColor("color(srgb 1 0.5 0)")).toEqual([255, 128, 0]);
  });

  it("returns null for anything it can't read, so callers fall back", () => {
    expect(parseComputedColor("")).toBeNull();
    expect(parseComputedColor("var(--nope)")).toBeNull();
  });
});

describe("mixRGB", () => {
  it("blends linearly between two colours", () => {
    expect(mixRGB([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
  });
});
