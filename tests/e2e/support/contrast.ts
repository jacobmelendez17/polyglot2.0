import type { Locator } from "@playwright/test";

/**
 * The lowest contrast found, the text it was found on (for a failure that says
 * where), and how many elements were measured (so "nothing was below 4.5" cannot
 * be true merely because nothing was looked at).
 */
export type ContrastReading = { ratio: number; text: string; measured: number };

/**
 * One in-page measurement behind both exports. For each element measured it takes
 * the text colour and the nearest opaque background, with any translucent layers
 * between them composited over it (the same measurement `admin-palettes.spec.ts`
 * makes for its own checks), and returns the WCAG contrast ratio of the *worst*
 * element. `scope: "element"` measures only the located element; `"text"`
 * measures it and every visible descendant that has text of its own.
 *
 * Everything lives inside the callback because Playwright serialises it into the
 * page: it cannot call anything defined outside.
 */
async function measure(
  locator: Locator,
  scope: "element" | "text",
): Promise<ContrastReading> {
  return locator.evaluate((root, mode) => {
    type Colour = { red: number; green: number; blue: number; alpha: number };
    const channels = (value: string): Colour | null => {
      const match = /rgba?\(([^)]+)\)/.exec(value);
      if (!match) return null;
      const [red = 0, green = 0, blue = 0, alpha = 1] = match[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return { red, green, blue, alpha };
    };
    const luminance = ({ red, green, blue }: Colour) => {
      const linear = (c: number) => {
        const share = c / 255;
        return share <= 0.03928
          ? share / 12.92
          : ((share + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
      );
    };
    const backdrop = (element: Element): Colour => {
      const layers: Colour[] = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
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
      return { red, green, blue, alpha: 1 };
    };
    const ratioOf = (element: Element): number => {
      const text = channels(getComputedStyle(element).color);
      // A colour this cannot read is a failure to measure, not a pass.
      if (!text) return 0;
      const behind = backdrop(element);
      const front: Colour = {
        red: text.red * text.alpha + behind.red * (1 - text.alpha),
        green: text.green * text.alpha + behind.green * (1 - text.alpha),
        blue: text.blue * text.alpha + behind.blue * (1 - text.alpha),
        alpha: 1,
      };
      const a = luminance(front);
      const b = luminance(behind);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const hasOwnVisibleText = (element: Element): boolean => {
      const own = Array.from(element.childNodes).some(
        (child) =>
          child.nodeType === Node.TEXT_NODE &&
          (child.textContent ?? "").trim().length > 0,
      );
      if (!own) return false;
      const { width, height } = element.getBoundingClientRect();
      // Screen-reader-only text is clipped to a pixel; it is not on the screen.
      return (
        width > 1 &&
        height > 1 &&
        getComputedStyle(element).visibility !== "hidden"
      );
    };

    const elements =
      mode === "element"
        ? [root]
        : [root, ...Array.from(root.querySelectorAll("*"))].filter(
            hasOwnVisibleText,
          );
    let worst: ContrastReading = {
      ratio: Infinity,
      text: "",
      measured: elements.length,
    };
    for (const element of elements) {
      const ratio = ratioOf(element);
      if (ratio < worst.ratio) {
        worst = {
          ratio,
          text: (element.textContent ?? "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 80),
          measured: elements.length,
        };
      }
    }
    return worst;
  }, scope);
}

/** The WCAG contrast of one element's text against what is actually behind it. */
export async function textContrast(locator: Locator): Promise<number> {
  return (await measure(locator, "element")).ratio;
}

/**
 * The lowest contrast among all the text under `locator` (and on it), so a test
 * can say "no text here is below 4.5:1" instead of sampling a few elements and
 * missing the one that is. `text` names the offender.
 */
export async function lowestTextContrast(
  locator: Locator,
): Promise<ContrastReading> {
  return measure(locator, "text");
}
