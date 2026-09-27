"use client";

// "Marigold melt" (slide 3 → 4): blobs pour out of the Next button and merge
// (SVG goo filter) until they cover the page in the next slide's colour. The
// next slide is revealed underneath at MELT_MS, then this overlay unmounts.

import { motion } from "motion/react";

import { MELT_MS } from "./lib/transitions";

const SPOTS: Array<[number, number]> = [
  [0.2, 0.2],
  [0.78, 0.22],
  [0.5, 0.5],
  [0.18, 0.78],
  [0.82, 0.8],
  [0.5, 0.12],
  [0.5, 0.9],
];
const BLOB = 80;

export type MeltOrigin = {
  origin: { x: number; y: number };
  size: { w: number; h: number };
  color: string;
};

export function MeltOverlay({ origin, size, color }: MeltOrigin) {
  const scale = (Math.max(size.w, size.h) / BLOB) * 1.15;
  const stagger = 0.04;
  const duration = MELT_MS / 1000 - stagger * (SPOTS.length - 1);
  return (
    <>
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden="true"
      >
        <filter id="ob-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="13" result="b" />
          <feColorMatrix
            in="b"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
          />
        </filter>
      </svg>
      <div className="ob-melt" aria-hidden="true">
        {SPOTS.map(([sx, sy], k) => {
          const tx = sx * size.w - origin.x;
          const ty = sy * size.h - origin.y;
          return (
            <motion.span
              key={k}
              style={{ left: origin.x, top: origin.y, background: color }}
              initial={{ x: 0, y: 0, scale: 0 }}
              animate={{
                x: [0, tx * 0.55, tx],
                y: [0, ty * 0.55, ty],
                scale: [0, 2.4, scale],
              }}
              transition={{
                duration,
                delay: k * stagger,
                times: [0, 0.45, 1],
                ease: [0.6, 0, 0.3, 1],
              }}
            />
          );
        })}
      </div>
    </>
  );
}
