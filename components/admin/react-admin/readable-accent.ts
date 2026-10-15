/**
 * The accent colour *as text*, for the Material UI parts of the Admin console.
 *
 * Polyglot's accent (`--accent-primary`, one per Appearance palette) is a
 * **fill** colour: the app's own buttons paint it as a background with dark
 * `--accent-foreground` text on top. Material UI also paints the *text* of its
 * outlined and text buttons, links and focused field labels in the primary
 * colour — and on the cream light-mode page the default Sage accent is only
 * 2.4:1 against it (Amber 2.6:1, Ocean 3.2:1, Plum 3.5:1), where WCAG AA asks for
 * 4.5:1 for text this size. `ui-context.md` asks for "sufficient text/background
 * contrast"; the shadcn buttons this console replaces never put the accent on a
 * page as text, so this is a defect React Admin's defaults would otherwise have
 * introduced.
 *
 * So the text takes the accent and moves it toward the app's own text colour
 * **only as far as it must** to reach AA on every surface these controls sit on
 * — the page, a card, and a hovered or selected tint of either. Where the accent
 * already reads (most palettes in dark mode) it is returned untouched; fills,
 * borders and checkboxes keep the accent itself.
 */

type Rgb = [number, number, number];

/** WCAG 2.x AA for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * What Material UI lays over a surface under the pointer (`action.hover`): black
 * at 4% in light mode, white at 8% in dark. It lands on the page behind a toolbar
 * and on a card or table row, so the text must read on the tinted surface too.
 */
const LIGHT_HOVER = { overlay: [0, 0, 0] as Rgb, share: 0.04 };
const DARK_HOVER = { overlay: [255, 255, 255] as Rgb, share: 0.08 };

/** What the search aims for: AA plus a little, so a browser's 8-bit compositing cannot land a hair under it. */
const TARGET_CONTRAST = MIN_TEXT_CONTRAST + 0.05;

/** `#rgb` or `#rrggbb` as channels; `null` for anything else (a named colour, `rgb()`, `var()`, nothing), so a caller falls back instead of guessing. */
export function parseHex(value: string | undefined): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const digits =
    match[1]!.length === 3
      ? [...match[1]!].map((digit) => digit + digit).join("")
      : match[1]!;
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as Rgb;
}

function toHex(channels: Rgb): string {
  return `#${channels
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** The WCAG contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

function mix(from: Rgb, toward: Rgb, share: number): Rgb {
  return from.map(
    (channel, index) => channel + (toward[index]! - channel) * share,
  ) as Rgb;
}

type AccentTextTokens = {
  "--accent-primary"?: string;
  "--bg-base"?: string;
  "--bg-surface"?: string;
  "--text-primary"?: string;
};

/**
 * The accent as readable text on this theme's surfaces: the accent itself when
 * it already reaches AA on all of them, otherwise the accent moved toward the
 * text colour in 1% steps to the first mix that does (the text colour itself if
 * nothing short of it will). A token that is missing or is not a hex colour
 * leaves the accent as it was — the arithmetic needs real colours, and the
 * previous behaviour is the safe fallback.
 */
export function readableAccentText(
  tokens: AccentTextTokens,
): string | undefined {
  const accentValue = tokens["--accent-primary"];
  const accent = parseHex(accentValue);
  const text = parseHex(tokens["--text-primary"]);
  const base = parseHex(tokens["--bg-base"]);
  if (!accent || !text || !base) return accentValue;

  const surface = parseHex(tokens["--bg-surface"]) ?? base;
  // A dark theme is one whose page is darker than its text.
  const { overlay, share } =
    luminance(base) < luminance(text) ? DARK_HOVER : LIGHT_HOVER;
  const surfaces = [
    base,
    surface,
    mix(base, overlay, share),
    mix(surface, overlay, share),
  ];

  for (let percent = 0; percent <= 100; percent++) {
    // Rounded to the channels the hex will carry: that is the colour tested.
    const candidate = mix(accent, text, percent / 100).map(Math.round) as Rgb;
    if (
      surfaces.every(
        (background) => contrastRatio(candidate, background) >= TARGET_CONTRAST,
      )
    ) {
      return percent === 0 ? accentValue : toHex(candidate);
    }
  }
  return toHex(text);
}
