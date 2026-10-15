import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Spec 26 §10 — "UI matches `ui-context.md` across theme modes, accent
 * palettes, mobile and accessibility checks". Light, dark and 390px are covered
 * screen by screen in the other admin specs; none of them ever switched the
 * accent palette (spec 20: Sage, Ocean, Amber, Plum), which until this file was
 * covered by unit tests only.
 *
 * React Admin paints from a Material UI theme built out of the app's live CSS
 * variables (`polyglot-theme.ts`, which also watches `data-palette`), so a
 * palette needs no per-screen work. This proves that in a real browser: choose
 * each palette the way Settings does — the stored appearance, applied by the
 * bootstrap script before React hydrates — and the Material UI primary colour on
 * the Curriculum list is that palette's own `--accent-primary`, in light and in
 * dark. It also measures what the palettes put *behind text*: Material UI paints
 * an outlined button's label in the primary colour, which on the light page is
 * far too faint for the accent itself (Sage 2.4:1), so the theme darkens it to AA
 * (`readable-accent.ts`) — checked here on the real button, against its real
 * background, in every palette. Nothing here writes to the database: ticking the
 * list's select-all box is client state.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const APPEARANCE_KEY = "polyglot:appearance:v1";
const PALETTES = ["sage", "ocean", "amber", "plum"] as const;

test.use({ storageState: ADMIN_AUTH });

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const table = (page: Page) =>
  page.getByRole("table", { name: "Curriculum items" });

/** `#4a8fa0` as the `rgb(...)` text a computed style reports. */
function toRgb(hex: string): string {
  const digits = hex.trim().replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) =>
    parseInt(digits.slice(at, at + 2), 16),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

/** Stores the appearance as Settings does, then reloads so the app's own bootstrap script applies it. */
async function chooseAppearance(
  page: Page,
  palette: (typeof PALETTES)[number],
  theme: "light" | "dark",
): Promise<void> {
  await page.evaluate(
    ([key, value]) =>
      window.localStorage.setItem(key as string, value as string),
    [
      APPEARANCE_KEY,
      JSON.stringify({
        theme,
        palette,
        fontFamily: "cozy",
        fontScale: "default",
        colorBlindAssistance: false,
      }),
    ],
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
  await expect(table(page)).toBeVisible();
}

/**
 * The WCAG contrast of an element's text colour against what is actually behind
 * it: the nearest opaque background, with any translucent layers between (a
 * hovered bar's tint) composited over it.
 */
async function textContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const channels = (value: string) => {
      const match = /rgba?\(([^)]+)\)/.exec(value);
      if (!match) return null;
      const [red = 0, green = 0, blue = 0, alpha = 1] = match[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return { red, green, blue, alpha };
    };
    const layers: {
      red: number;
      green: number;
      blue: number;
      alpha: number;
    }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const layer = channels(getComputedStyle(node).backgroundColor);
      if (!layer || layer.alpha === 0) continue;
      layers.push(layer);
      if (layer.alpha === 1) break;
    }
    // From the bottom layer up; with nothing opaque under it, white.
    let { red, green, blue } =
      layers.at(-1)?.alpha === 1
        ? layers.pop()!
        : { red: 255, green: 255, blue: 255 };
    for (const layer of layers.reverse()) {
      red = layer.red * layer.alpha + red * (1 - layer.alpha);
      green = layer.green * layer.alpha + green * (1 - layer.alpha);
      blue = layer.blue * layer.alpha + blue * (1 - layer.alpha);
    }
    const text = channels(getComputedStyle(element).color)!;
    const luminance = (r: number, g: number, b: number) => {
      const linear = (c: number) => {
        const share = c / 255;
        return share <= 0.03928
          ? share / 12.92
          : ((share + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const a = luminance(text.red, text.green, text.blue);
    const b = luminance(red, green, blue);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the Curriculum list follows each accent palette in ${theme} mode`, async ({
    page,
  }) => {
    await page.goto("/admin/curriculum");
    await expect(table(page)).toBeVisible({ timeout: 60_000 });

    const accents: Record<string, string> = {};
    for (const palette of PALETTES) {
      await chooseAppearance(page, palette, theme);
      const root = page.locator("html");
      await expect(root).toHaveAttribute("data-palette", palette);
      if (theme === "dark") await expect(root).toHaveClass(/dark/);
      else await expect(root).not.toHaveClass(/dark/);

      const accent = (
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--accent-primary")
            .trim(),
        )
      ).toLowerCase();
      accents[palette] = accent;

      // A ticked Material UI checkbox is painted in the theme's primary colour.
      const selectAll = table(page).getByRole("checkbox").first();
      await selectAll.check();
      await expect(
        page.getByRole("group", { name: "Actions for the selected items" }),
      ).toBeVisible();
      const painted = selectAll.locator(
        "xpath=ancestor::span[contains(concat(' ', normalize-space(@class), ' '), ' MuiCheckbox-root ')][1]",
      );
      await expect
        .poll(
          () => painted.evaluate((element) => getComputedStyle(element).color),
          {
            message: `${palette}, ${theme}: the checkbox follows --accent-primary ${accent}`,
          },
        )
        .toBe(toRgb(accent));

      // An outlined button's label is accent-coloured text: it must still read.
      const outlined = page.getByRole("button", { name: "Move to level" });
      await expect(outlined).toBeVisible();
      expect(
        await textContrast(outlined),
        `${palette}, ${theme}: "Move to level" text against its background`,
      ).toBeGreaterThanOrEqual(4.5);

      await page.mouse.move(0, 0);
      await shot(page, `palette-curriculum-${palette}-${theme}`);
    }

    // The attribute really changed the variable: four palettes, four accents.
    expect(new Set(Object.values(accents)).size).toBe(PALETTES.length);
  });
}
