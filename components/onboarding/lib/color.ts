// Pure colour helpers for the onboarding canvas/SVG parts (no React, no DOM).

import type { RGB } from "./tower";

/** Parses what `getComputedStyle().color` returns: `rgb()`, `rgba()`, or `color(srgb r g b)`. */
export function parseComputedColor(value: string): RGB | null {
  const legacy = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (legacy) {
    return [Number(legacy[1]), Number(legacy[2]), Number(legacy[3])].map(
      Math.round,
    ) as RGB;
  }
  const srgb = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (srgb) {
    return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])].map((channel) =>
      Math.round(channel * 255),
    ) as RGB;
  }
  return null;
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as RGB;
}
