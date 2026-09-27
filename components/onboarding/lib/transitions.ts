// Onboarding slide transitions (spec §14, §35).
//
// Which transition plays is a pure function of (from, to, reduced motion), so it
// can be unit tested without rendering anything. Five slides as of 2026-09-27
// (0 welcome, 1 foundation, 2 characters, 3 customize, 4 finale):
//   welcome -> foundation  horizontal block slide — the welcome slide's own
//     "transition with motion graphics" ask, same real motion as every other
//     non-special-cased move rather than a second transition kind for one pair
//   slide 1 <-> 2  vertical block slide (the next page rises from the bottom)
//   slide 3  -> 4  "marigold melt": liquid blobs pour out of the Next button
//   everything else  horizontal block slide (the whole page, background included)
//   reduced motion  a short crossfade, always

import type { Variants } from "motion/react";

export type TransitionKind = "fade" | "vertical" | "horizontal" | "melt";

/** Custom data passed through AnimatePresence to every slide's variants. */
export type SlideMotion = {
  kind: TransitionKind;
  /** +1 moving forward, -1 moving back. */
  dir: 1 | -1;
};

export const SLIDE_MS = 760;
export const FADE_MS = 200;
/** Blob growth (720ms) plus the last blob's stagger (6 × 40ms). */
export const MELT_MS = 960;
export const SLIDE_EASE = [0.77, 0, 0.18, 1] as const;

export function transitionKind(
  from: number,
  to: number,
  reduced: boolean,
): TransitionKind {
  if (reduced) return "fade";
  if (from === 3 && to === 4) return "melt";
  if (Math.abs(from - to) === 1 && Math.min(from, to) === 1) return "vertical";
  return "horizontal";
}

/** How long the navigation stays locked for a given transition. */
export function transitionDuration(kind: TransitionKind): number {
  if (kind === "fade") return FADE_MS;
  if (kind === "melt") return MELT_MS;
  return SLIDE_MS;
}

const slideTransition = { duration: SLIDE_MS / 1000, ease: SLIDE_EASE };

export const slideVariants: Variants = {
  enter: ({ kind, dir }: SlideMotion) => {
    if (kind === "horizontal") return { x: `${dir * 100}%`, y: 0, opacity: 1 };
    if (kind === "vertical") return { x: 0, y: `${dir * 100}%`, opacity: 1 };
    // fade and melt both start hidden; melt reveals the slide once the blobs cover the page
    return { x: 0, y: 0, opacity: 0 };
  },
  center: ({ kind }: SlideMotion) => {
    if (kind === "fade")
      return {
        x: 0,
        y: 0,
        opacity: 1,
        transition: { duration: FADE_MS / 1000 },
      };
    if (kind === "melt")
      return {
        x: 0,
        y: 0,
        opacity: 1,
        transition: { opacity: { delay: MELT_MS / 1000, duration: 0 } },
      };
    return { x: 0, y: 0, opacity: 1, transition: slideTransition };
  },
  exit: ({ kind, dir }: SlideMotion) => {
    if (kind === "horizontal")
      return { x: `${-dir * 100}%`, transition: slideTransition };
    if (kind === "vertical")
      return { y: `${-dir * 100}%`, transition: slideTransition };
    if (kind === "fade")
      return { opacity: 0, transition: { duration: FADE_MS / 1000 } };
    // melt: the old slide stays put underneath the blobs until they finish
    return { opacity: 1, transition: { duration: MELT_MS / 1000 } };
  },
};
