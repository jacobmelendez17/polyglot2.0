import { describe, expect, it } from "vitest";

import {
  MIN_TEXT_CONTRAST,
  contrastRatio,
  parseHex,
  readableAccentText,
} from "./readable-accent";

/** The surfaces and accents `app/globals.css` defines for each mode and Appearance palette. */
const LIGHT = {
  "--bg-base": "#f8efe7",
  "--bg-surface": "#ffffff",
  "--text-primary": "#3e4440",
};
const DARK = {
  "--bg-base": "#202521",
  "--bg-surface": "#292f2b",
  "--text-primary": "#f3ece4",
};
const ACCENTS = {
  light: {
    sage: "#7fa69c",
    ocean: "#4a8fa0",
    amber: "#c98a3e",
    plum: "#9b6fa6",
  },
  dark: {
    sage: "#8db5aa",
    ocean: "#5fa8ba",
    amber: "#d9a45f",
    plum: "#b084bc",
  },
} as const;

function channels(hex: string) {
  const parsed = parseHex(hex);
  if (!parsed) throw new Error(`not a hex colour: ${hex}`);
  return parsed;
}

/**
 * The worst contrast of `color` over the page, a card, and each of them under
 * the hover overlay Material UI really lays on them (`action.hover`: black at 4%
 * in light mode, white at 8% in dark).
 */
function worstContrast(color: string, surfaces: typeof LIGHT): number {
  const base = channels(surfaces["--bg-base"]);
  const card = channels(surfaces["--bg-surface"]);
  const [overlay, hover] =
    surfaces === DARK ? ([255, 0.08] as const) : ([0, 0.04] as const);
  const tinted = (from: [number, number, number]) =>
    from.map((channel) => channel + (overlay - channel) * hover) as [
      number,
      number,
      number,
    ];
  return Math.min(
    ...[base, card, tinted(base), tinted(card)].map((background) =>
      contrastRatio(channels(color), background),
    ),
  );
}

describe("parseHex", () => {
  it.each([
    ["#7fa69c", [127, 166, 156]],
    ["#7FA69C", [127, 166, 156]],
    ["  #fff ", [255, 255, 255]],
    ["#000", [0, 0, 0]],
  ])("reads %s", (value, expected) => {
    expect(parseHex(value)).toEqual(expected);
  });

  it.each([
    "rgb(1, 2, 3)",
    "var(--accent-primary)",
    "red",
    "#12345",
    "#1234567",
    "",
    undefined,
  ])("does not guess at %s", (value) => {
    expect(parseHex(value)).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, 1 for a colour on itself, and the same either way round", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([127, 166, 156], [127, 166, 156])).toBe(1);
    expect(contrastRatio([10, 20, 30], [200, 210, 220])).toBeCloseTo(
      contrastRatio([200, 210, 220], [10, 20, 30]),
      10,
    );
  });
});

describe("readableAccentText", () => {
  it.each(Object.entries(ACCENTS.light))(
    "makes the %s accent readable in light mode, on the page, a card and a tinted row",
    (_palette, accent) => {
      // The raw accent is the problem this solves: Sage is 2.4:1 on the page.
      expect(worstContrast(accent, LIGHT)).toBeLessThan(MIN_TEXT_CONTRAST);

      const text = readableAccentText({ ...LIGHT, "--accent-primary": accent });
      expect(text).toBeDefined();
      expect(worstContrast(text!, LIGHT)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    },
  );

  it.each(Object.entries(ACCENTS.light))(
    "moves the %s accent only as far as it must — not on to the text colour",
    (_palette, accent) => {
      const text = readableAccentText({
        ...LIGHT,
        "--accent-primary": accent,
      })!;
      // Neither the text colour nor the accent: a shade between them that does
      // not overshoot — on the plain page it reads well short of the text
      // colour's own contrast (about 9:1).
      expect(text).not.toBe(LIGHT["--text-primary"]);
      expect(text).not.toBe(accent);
      expect(
        contrastRatio(channels(text), channels(LIGHT["--bg-base"])),
      ).toBeLessThan(6);
    },
  );

  it("keeps the accent's hue: a darker green for Sage, not a grey", () => {
    const [red, green, blue] = channels(
      readableAccentText({ ...LIGHT, "--accent-primary": ACCENTS.light.sage })!,
    );
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it.each(Object.entries(ACCENTS.dark))(
    "reads the %s accent in dark mode",
    (_palette, accent) => {
      const text = readableAccentText({ ...DARK, "--accent-primary": accent });
      expect(worstContrast(text!, DARK)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    },
  );

  it.each(["sage", "amber"] as const)(
    "leaves the %s accent exactly as it is in dark mode, where it already reads on every surface",
    (palette) => {
      const accent = ACCENTS.dark[palette];
      expect(readableAccentText({ ...DARK, "--accent-primary": accent })).toBe(
        accent,
      );
    },
  );

  it("falls back to the text colour when nothing short of it will do", () => {
    // Text the same colour as the page: no mix can ever read.
    expect(
      readableAccentText({
        "--accent-primary": "#7fa69c",
        "--bg-base": "#3e4440",
        "--bg-surface": "#3e4440",
        "--text-primary": "#3e4440",
      }),
    ).toBe("#3e4440");
  });

  it("uses the page for a card when there is no surface token", () => {
    const withoutSurface = readableAccentText({
      "--accent-primary": ACCENTS.light.sage,
      "--bg-base": LIGHT["--bg-base"],
      "--text-primary": LIGHT["--text-primary"],
    });
    expect(withoutSurface).toBeDefined();
    expect(
      contrastRatio(channels(withoutSurface!), channels("#f8efe7")),
    ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each([
    [
      "no text token",
      { "--accent-primary": "#7fa69c", "--bg-base": "#f8efe7" },
    ],
    [
      "no page token",
      { "--accent-primary": "#7fa69c", "--text-primary": "#3e4440" },
    ],
    [
      "a colour that is not hex",
      {
        "--accent-primary": "rgb(127, 166, 156)",
        "--bg-base": "#f8efe7",
        "--text-primary": "#3e4440",
      },
    ],
  ])(
    "hands the accent back untouched with %s — it has nothing to calculate with",
    (_what, tokens) => {
      expect(readableAccentText(tokens)).toBe(tokens["--accent-primary"]);
    },
  );

  it("has nothing to say without an accent", () => {
    expect(readableAccentText({ ...LIGHT })).toBeUndefined();
  });
});
