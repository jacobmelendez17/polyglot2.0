"use client";

// Slide 1 visual: an isometric tower that builds one plate per SRS stage.
// Plates fall straight down (accelerating, no overshoot) and land exactly on the
// plate below; each stage label fades in only after its plate lands. At Fluent
// the tower holds, clears top-down, and rebuilds.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import {
  STAGE_COUNT,
  TOWER,
  TOWER_TIMING as T,
  rgb,
  shade,
  srsPalette,
  stageName,
  towerGeometry,
} from "./lib/tower";
import { useThemeTokens } from "./lib/use-theme-tokens";

const DROP_EASE = [0.55, 0, 0.85, 0.4] as const;

export function SrsTower() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { read, version } = useThemeTokens(ref);
  const palette = useMemo(
    () => srsPalette(read("card"), read("accent"), read("ink")),
    [read],
  );
  const plates = useMemo(() => towerGeometry(), []);

  const [built, setCount] = useState(0);
  const [clearingLoop, setClearing] = useState(false);
  const [cycle, setCycle] = useState(0);
  // Reduced motion shows the finished tower and runs no loop at all.
  const count = reduce ? STAGE_COUNT : built;
  const clearing = reduce ? false : clearingLoop;

  useEffect(() => {
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    if (clearing) {
      timer = setTimeout(
        () => {
          setClearing(false);
          setCount(0);
          setCycle((c) => c + 1);
        },
        (STAGE_COUNT - 1) * T.clearStagger + T.clear + T.restart,
      );
    } else if (count < STAGE_COUNT) {
      timer = setTimeout(
        () => setCount((c) => c + 1),
        count === 0 ? T.firstDrop : T.drop + T.gap,
      );
    } else {
      timer = setTimeout(() => setClearing(true), T.drop + T.holdAtTop);
    }
    return () => clearTimeout(timer);
  }, [count, clearing, reduce]);

  return (
    <div className="ob-tower" ref={ref} data-theme-version={version}>
      <svg
        viewBox={`0 0 ${TOWER.width} ${TOWER.height}`}
        role="img"
        aria-label="A tower builds one block per review stage, from Beginner 1 to Fluent. Each block is thicker and a deeper colour, because the wait before the next review grows."
      >
        <g>
          {plates.slice(0, count).map((p) => {
            const c = palette[p.k]!;
            return (
              <motion.g
                key={`${cycle}-${p.k}`}
                initial={reduce ? false : { y: -240, opacity: 0 }}
                animate={
                  clearing
                    ? {
                        y: -30,
                        opacity: 0,
                        transition: {
                          delay:
                            ((STAGE_COUNT - 1 - p.k) * T.clearStagger) / 1000,
                          duration: T.clear / 1000,
                          ease: "easeIn",
                        },
                      }
                    : {
                        y: 0,
                        opacity: 1,
                        transition: {
                          y: { duration: T.drop / 1000, ease: DROP_EASE },
                          opacity: { duration: 0.07 },
                        },
                      }
                }
              >
                <polygon points={p.left} fill={shade(c, 0.86)} />
                <polygon points={p.right} fill={shade(c, 0.72)} />
                <polygon points={p.top} fill={rgb(c)} />
              </motion.g>
            );
          })}
        </g>
        <g>
          {plates.slice(0, count).map((p) => {
            const { anchorX: ax, anchorY: ay, y, textX } = p.label;
            return (
              <motion.g
                key={`${cycle}-label-${p.k}`}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={
                  clearing
                    ? { opacity: 0, transition: { duration: 0.3 } }
                    : {
                        // wait for the plate to land before the label appears
                        opacity: 1,
                        x: 0,
                        transition: {
                          delay: T.drop / 1000,
                          duration: 0.42,
                          ease: [0.16, 1, 0.3, 1],
                        },
                      }
                }
              >
                <path
                  d={`M${ax} ${ay} L${ax + 34} ${y} L${ax + 52} ${y}`}
                  fill="none"
                  stroke="var(--ob-soft)"
                  strokeWidth={1.2}
                />
                <circle cx={ax} cy={ay} r={2.5} fill="var(--ob-soft)" />
                <text
                  className={`ob-tower-label${p.k === STAGE_COUNT - 1 ? " top" : ""}`}
                  x={textX}
                  y={y + 4}
                >
                  {stageName(p.k)}
                </text>
              </motion.g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
