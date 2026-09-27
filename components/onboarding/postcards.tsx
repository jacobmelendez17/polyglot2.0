"use client";

// Slide 4 decoration: postcards saying "Have fun!" in ten languages. They fly
// in from the nearest side after the melt, float gently at rest, lift on hover
// and flip on click to show a handwritten back. Artwork is original, flat and
// geometric (inspired by mid-century travel postcards), and fixed in both
// themes — these are illustrations, not UI.

import { useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { POSTCARDS, type Postcard } from "./lib/content";

export function Postcards({ delay = 0 }: { delay?: number }) {
  return (
    <div className="ob-cards">
      {POSTCARDS.map((card, i) => (
        <Card key={card.lang} card={card} index={i} delay={delay} />
      ))}
    </div>
  );
}

function Card({
  card,
  index,
  delay,
}: {
  card: Postcard;
  index: number;
  delay: number;
}) {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const fromLeft = card.pos.left !== undefined;
  const travel = typeof window === "undefined" ? 700 : window.innerWidth * 0.55;

  return (
    <motion.div
      className="ob-pc"
      style={card.pos}
      initial={
        reduce
          ? false
          : {
              x: (fromLeft ? -1 : 1) * travel,
              y: -80 + ((index * 37) % 160),
              rotate: fromLeft ? -40 : 40,
              opacity: 0,
            }
      }
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{
        type: "spring",
        duration: 0.9,
        bounce: 0.3,
        delay: delay + index * 0.06,
      }}
    >
      <div
        className="ob-pc-float"
        style={{
          ["--rot" as string]: `${card.rot}deg`,
          ["--d" as string]: `${-index * 0.7}s`,
        }}
      >
        <button
          type="button"
          className="ob-pc-lift"
          style={{ ["--rot" as string]: `${card.rot}deg` }}
          aria-pressed={flipped}
          aria-label={`Postcard in ${card.lang}: ${card.text}, meaning Have fun. Flip it over.`}
          onClick={() => setFlipped((f) => !f)}
        >
          <span className={`ob-pc-inner${flipped ? " is-flipped" : ""}`}>
            <span className="ob-pc-front">
              <span className="ob-pc-art">
                <Motif card={card} />
              </span>
              <span className="ob-pc-greet">{card.text}</span>
              <span className="ob-pc-stamp">
                <span style={{ background: card.a }} />
              </span>
              <motion.svg
                className="ob-pc-mark"
                viewBox="0 0 40 40"
                aria-hidden="true"
                initial={reduce ? false : { scale: 1.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.55 }}
                transition={{
                  duration: 0.42,
                  ease: [0.16, 1, 0.3, 1],
                  delay: delay + 0.62 + index * 0.06,
                }}
              >
                <circle
                  cx="20"
                  cy="20"
                  r="15"
                  fill="none"
                  stroke="#2B2B2B"
                  strokeWidth="2"
                />
                <path
                  d="M-6 14 q5 -4 10 0 t10 0 t10 0 t10 0 t10 0 M-6 26 q5 -4 10 0 t10 0 t10 0 t10 0 t10 0"
                  fill="none"
                  stroke="#2B2B2B"
                  strokeWidth="1.6"
                />
              </motion.svg>
            </span>
            <span className="ob-pc-back">
              <span className="msg">
                <b>{card.text}</b>
                <span>{card.lang} for “Have fun!”</span>
                <span style={{ opacity: 0.7 }}>— the Polyglot crew</span>
              </span>
              <span className="addr">
                <span className="box" />
                <i />
                <i />
                <i />
              </span>
            </span>
          </span>
        </button>
      </div>
    </motion.div>
  );
}

const DEG = Math.PI / 180;

function Flower({
  x,
  y,
  r,
  petal,
  centre,
}: {
  x: number;
  y: number;
  r: number;
  petal: string;
  centre: string;
}) {
  return (
    <g>
      {[0, 60, 120, 180, 240, 300].map((d) => (
        <circle
          key={d}
          cx={x + Math.cos(d * DEG) * r}
          cy={y + Math.sin(d * DEG) * r}
          r={r * 0.62}
          fill={petal}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill={centre} />
    </g>
  );
}

function Motif({ card: c }: { card: Postcard }) {
  let art: ReactNode = null;
  switch (c.motif) {
    case "sun":
      art = (
        <>
          <circle cx="112" cy="30" r="14" fill={c.a} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
            <polygon
              key={d}
              points="-3,-20 3,-20 0,-29"
              fill={c.a}
              transform={`translate(112 30) rotate(${d})`}
            />
          ))}
          <ellipse cx="38" cy="112" rx="70" ry="38" fill={c.b} />
          <ellipse cx="124" cy="116" rx="62" ry="32" fill={c.c} opacity=".9" />
          <rect x="42" y="56" width="3" height="20" fill={c.c} />
          <circle cx="43.5" cy="54" r="8" fill={c.a} />
          <rect x="62" y="62" width="3" height="16" fill={c.c} />
          <circle cx="63.5" cy="60" r="6" fill={c.c} />
        </>
      );
      break;
    case "waves": {
      const wave = (y: number) =>
        `M0 ${y} ${Array.from({ length: 8 }, () => "q9.4 -10 18.75 0").join(" ")} V100 H0z`;
      art = (
        <>
          <circle cx="36" cy="28" r="12" fill={c.a} />
          <path d={wave(62)} fill={c.b} />
          <path d={wave(74)} fill={c.c} opacity=".9" />
          <path d={wave(86)} fill="#1B4F8A" />
          <polygon points="104,56 104,26 124,56" fill={c.c} />
          <polygon points="100,58 128,58 122,64 104,64" fill={c.b} />
        </>
      );
      break;
    }
    case "flowers":
      art = (
        <>
          <rect y="70" width="150" height="30" fill={c.b} />
          {[
            [22, 46],
            [58, 36],
            [94, 48],
            [128, 34],
          ].map(([x, y], i) => (
            <g key={x}>
              <rect
                x={x! - 1.2}
                y={y}
                width="2.4"
                height={72 - y!}
                fill={c.b}
              />
              <Flower
                x={x!}
                y={y!}
                r={8}
                petal={i % 2 ? c.a : c.c}
                centre={i % 2 ? c.c : c.a}
              />
            </g>
          ))}
        </>
      );
      break;
    case "stars":
      art = (
        <>
          <circle cx="118" cy="26" r="13" fill={c.a} />
          <circle cx="124" cy="22" r="12" fill={c.bg} />
          {[
            [20, 20],
            [48, 40],
            [80, 16],
            [34, 62],
            [96, 50],
            [66, 70],
            [130, 70],
          ].map(([x, y], i) => (
            <path
              key={`${x}-${y}`}
              d={`M${x} ${y! - 6} L${x! + 1.6} ${y! - 1.6} L${x! + 6} ${y} L${x! + 1.6} ${y! + 1.6} L${x} ${y! + 6} L${x! - 1.6} ${y! + 1.6} L${x! - 6} ${y} L${x! - 1.6} ${y! - 1.6}z`}
              fill={i % 3 ? c.c : c.b}
            />
          ))}
          <path d="M0 88 Q40 76 80 88 T150 84 V100 H0z" fill={c.b} />
        </>
      );
      break;
    case "trees":
      art = (
        <>
          <circle cx="120" cy="24" r="12" fill={c.c} />
          <rect y="78" width="150" height="22" fill={c.b} />
          {[
            [20, 40, 11],
            [44, 30, 14],
            [74, 44, 10],
            [100, 34, 13],
            [130, 46, 9],
          ].map(([x, y, r], i) => (
            <g key={x}>
              <rect x={x! - 1.5} y={y} width="3" height={80 - y!} fill={c.b} />
              <circle cx={x} cy={y} r={r} fill={i % 2 ? c.a : c.c} />
            </g>
          ))}
        </>
      );
      break;
    case "kites":
      art = (
        <>
          {(
            [
              [36, 30, c.a],
              [82, 20, c.b],
              [118, 40, c.c],
            ] as const
          ).map(([x, y, col]) => (
            <g key={x}>
              <polygon
                points={`${x},${y - 14} ${x + 10},${y} ${x},${y + 16} ${x - 10},${y}`}
                fill={col}
              />
              <line
                x1={x - 10}
                y1={y}
                x2={x + 10}
                y2={y}
                stroke={c.bg}
                strokeWidth="1.2"
                opacity=".6"
              />
              <path
                d={`M${x} ${y + 16} q-6 8 0 14 t0 14`}
                fill="none"
                stroke={col}
                strokeWidth="1.6"
              />
            </g>
          ))}
          <path d="M0 86 Q75 70 150 86 V100 H0z" fill={c.b} />
        </>
      );
      break;
  }
  return (
    <svg
      viewBox="0 0 150 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="150" height="100" fill={c.bg} />
      {art}
    </svg>
  );
}
