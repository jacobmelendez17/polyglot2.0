// SRS tower (onboarding slide 1). Pure geometry + colour so the visual is
// deterministic and testable; the component only animates what this returns.
//
// One plate per SRS stage (Beginner 1 → Fluent). Plates get thicker as the
// review interval grows, and their colour deepens from the card colour through
// the accent and on toward ink.
//
// The gradient is the approved illustration (2026-09-27 handoff) and
// deliberately not the per-stage-name `--srs-*` tokens: this is a picture of
// "intervals growing", every plate is labelled with its stage name, and colour
// never carries the meaning on its own.

import { SRS_STAGE_LABELS, SRS_STAGE_ORDER } from "@/domains/srs";

export type RGB = [number, number, number];

export const TOWER = {
  width: 560,
  height: 300,
  /** Centre of the tower — the middle of the viewBox, so it lines up with the text column. */
  cx: 280,
  /** Half-width and half-height of each isometric top face (2:1). */
  halfW: 84,
  halfH: 42,
  /** Where the bottom plate's lowest edge rests. */
  ground: 292,
} as const;

/** The app's own stage labels, in order — never a second list of names to drift. */
export const SRS_STAGES: readonly string[] = SRS_STAGE_ORDER.map(
  (stage) => SRS_STAGE_LABELS[stage],
);
export const STAGE_COUNT = SRS_STAGES.length;
export const stageName = (k: number): string => SRS_STAGES[k] ?? "";

export function plateThickness(k: number): number {
  return 9 + k * 1.5;
}

export type PlateGeometry = {
  k: number;
  /** y of the centre of the plate's top face */
  cy: number;
  thickness: number;
  left: string;
  right: string;
  top: string;
  /** leader-line label placement */
  label: { anchorX: number; anchorY: number; y: number; textX: number };
};

export function towerGeometry(): PlateGeometry[] {
  const { cx, halfW: w, halfH: h, ground } = TOWER;
  const plates: PlateGeometry[] = [];
  let cy = ground - h - plateThickness(0);
  for (let k = 0; k < STAGE_COUNT; k++) {
    const t = plateThickness(k);
    if (k > 0) cy -= t;
    const px = cx + w;
    plates.push({
      k,
      cy,
      thickness: t,
      left: `${cx - w},${cy} ${cx},${cy + h} ${cx},${cy + h + t} ${cx - w},${cy + t}`,
      right: `${cx},${cy + h} ${cx + w},${cy} ${cx + w},${cy + t} ${cx},${cy + h + t}`,
      top: `${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`,
      label: {
        anchorX: px + 6,
        anchorY: cy + t / 2,
        y: 262 - k * 25,
        textX: px + 64,
      },
    });
  }
  return plates;
}

const mix = (a: RGB, b: RGB, t: number): RGB =>
  a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as RGB;

/** Nine colours: card → accent over six steps, then accent → ink over three. */
export function srsPalette(card: RGB, accent: RGB, ink: RGB): RGB[] {
  const toAccent = [0.14, 0.3, 0.46, 0.62, 0.8, 1].map((t) =>
    mix(card, accent, t),
  );
  const toInk = [0.22, 0.4, 0.56].map((t) => mix(accent, ink, t));
  return [...toAccent, ...toInk];
}

/** Side faces are the top colour darkened, so each plate reads as a solid block. */
export function shade([r, g, b]: RGB, factor: number): string {
  return `rgb(${Math.round(r * factor)} ${Math.round(g * factor)} ${Math.round(b * factor)})`;
}

export const rgb = ([r, g, b]: RGB): string => `rgb(${r} ${g} ${b})`;

/** Timing for the build/clear loop, in ms. */
export const TOWER_TIMING = {
  firstDrop: 300,
  drop: 560,
  gap: 780,
  holdAtTop: 2000,
  clearStagger: 55,
  clear: 420,
  restart: 400,
} as const;
