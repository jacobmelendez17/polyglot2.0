"use client";

// Onboarding slideshow (spec 15, v2): four slides, block-slide transitions, a
// liquid "melt" into the finale, full keyboard support and a reduced-motion
// fallback (every transition becomes a 200ms crossfade; idle loops stop).
//
// Wiring is left to the caller: pass onFinish (mark onboarding complete, route
// on). `OnboardingFlow` owns that, plus replay/preview behavior.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { CharacterCast } from "./character-cast";
import { SLIDE_COPY, type OnboardingCharacter } from "./lib/content";
import {
  PARTICLE_COLORS,
  SIZE_DEFAULT,
  type ParticleColorId,
} from "./lib/particles";
import type { SpeechProvider } from "./lib/speech";
import {
  MELT_MS,
  slideVariants,
  transitionDuration,
  transitionKind,
  type SlideMotion,
} from "./lib/transitions";
import { mixRGB } from "./lib/color";
import { useThemeTokens } from "./lib/use-theme-tokens";
import { MeltOverlay, type MeltOrigin } from "./melt-overlay";
import { ParticleControls } from "./particle-controls";
import { ParticleField } from "./particle-field";
import { Postcards } from "./postcards";
import { SrsTower } from "./srs-tower";
import "./onboarding.css";

const SLIDE_COUNT = 4;
const TONES = [
  "ob-tone-bg ob-grid",
  "ob-tone-pink ob-grid",
  "ob-tone-green ob-grid ob-slide-particles",
  "ob-tone-gold",
];

type OnboardingSlidesProps = {
  onFinish: () => void;
  /** True while completion is being saved — disables the finale button. */
  isFinishing?: boolean;
  /** A completion failure, shown on the finale so the learner can retry. */
  error?: string | null;
  cast?: OnboardingCharacter[];
  speech?: SpeechProvider;
};

export function OnboardingSlides({
  onFinish,
  isFinishing = false,
  error = null,
  cast,
  speech,
}: OnboardingSlidesProps) {
  const reduce = Boolean(useReducedMotion());
  const root = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const { read } = useThemeTokens(root);

  const [index, setIndex] = useState(0);
  const [motionData, setMotionData] = useState<SlideMotion>({
    kind: "horizontal",
    dir: 1,
  });
  const [melt, setMelt] = useState<MeltOrigin | null>(null);
  const busy = useRef(false);

  // slide 3 settings live here so they survive going back and forth
  const [colorId, setColorId] = useState<ParticleColorId>("sage");
  const [size, setSize] = useState(SIZE_DEFAULT);
  const [letters, setLetters] = useState(false);
  const colorOf = (id: ParticleColorId): string => {
    const c = PARTICLE_COLORS.find((x) => x.id === id) ?? PARTICLE_COLORS[0];
    const base = read(c.token);
    const [r, g, b] = c.deepen ? mixRGB(base, read("ink"), c.deepen) : base;
    return `rgb(${r} ${g} ${b})`;
  };

  function go(to: number) {
    if (busy.current || to < 0 || to >= SLIDE_COUNT || to === index) return;
    const kind = transitionKind(index, to, reduce);
    busy.current = true;
    setTimeout(
      () => {
        busy.current = false;
      },
      transitionDuration(kind) + 40,
    );

    if (kind === "melt" && root.current && nextBtn.current) {
      const s = root.current.getBoundingClientRect();
      const b = nextBtn.current.getBoundingClientRect();
      const [r, g, bl] = read("marigold");
      setMelt({
        origin: {
          x: b.left - s.left + b.width / 2,
          y: b.top - s.top + b.height / 2,
        },
        size: { w: s.width, h: s.height },
        color: `rgb(${r} ${g} ${bl})`,
      });
      setTimeout(() => setMelt(null), MELT_MS + 60);
    }
    setMotionData({ kind, dir: to > index ? 1 : -1 });
    setIndex(to);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (
        t?.closest(
          "input, textarea, select, [role=listbox], [contenteditable=true]",
        )
      )
        return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const last = index === SLIDE_COUNT - 1;
  const arrivedByMelt = motionData.kind === "melt";

  return (
    <div
      className="ob"
      ref={root}
      aria-roledescription="carousel"
      aria-label="Welcome to Polyglot"
    >
      {!last && (
        <button
          type="button"
          className="ob-skip"
          onClick={() => go(SLIDE_COUNT - 1)}
        >
          Skip
        </button>
      )}
      <p className="ob-sr" aria-live="polite">
        Step {index + 1} of {SLIDE_COUNT}
      </p>

      <AnimatePresence initial={false} custom={motionData}>
        <motion.section
          key={index}
          className={`ob-slide ${TONES[index]}`}
          custom={motionData}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          aria-roledescription="slide"
          aria-label={`Step ${index + 1} of ${SLIDE_COUNT}`}
        >
          {index === 0 && (
            <div className="ob-col">
              <div className="ob-visual">
                <SrsTower />
              </div>
              <div className="ob-copy">
                <span className="ob-kicker">
                  {SLIDE_COPY.foundation.kicker}
                </span>
                <h1 className="ob-title">{SLIDE_COPY.foundation.title}</h1>
                <p>{SLIDE_COPY.foundation.body}</p>
              </div>
            </div>
          )}
          {index === 1 && (
            <div className="ob-col">
              <div className="ob-visual">
                <CharacterCast cast={cast} speech={speech} />
              </div>
              <div className="ob-copy">
                <span className="ob-hint">{SLIDE_COPY.immerse.hint}</span>
                <h1 className="ob-title">{SLIDE_COPY.immerse.title}</h1>
                <p>{SLIDE_COPY.immerse.body}</p>
              </div>
            </div>
          )}
          {index === 2 && (
            <>
              <ParticleField
                color={colorOf(colorId)}
                size={size}
                letters={letters}
              />
              <div className="ob-col">
                <div className="ob-copy">
                  <span className="ob-kicker">
                    {SLIDE_COPY.customize.kicker}
                  </span>
                  <h1 className="ob-title">{SLIDE_COPY.customize.title}</h1>
                  <p>{SLIDE_COPY.customize.body}</p>
                </div>
                <ParticleControls
                  colorId={colorId}
                  onColor={setColorId}
                  swatch={colorOf}
                  size={size}
                  onSize={setSize}
                  letters={letters}
                  onLetters={setLetters}
                />
              </div>
            </>
          )}
          {index === 3 && (
            <Finale
              delay={arrivedByMelt && !reduce ? MELT_MS / 1000 : 0}
              onFinish={onFinish}
              isFinishing={isFinishing}
              error={error}
            />
          )}
        </motion.section>
      </AnimatePresence>

      {melt && <MeltOverlay {...melt} />}

      <nav
        className={`ob-nav${last ? " is-last" : ""}`}
        aria-label="Onboarding"
      >
        <div className="ob-dots" aria-hidden="true">
          {Array.from({ length: SLIDE_COUNT }, (_, k) => (
            <i key={k} className={k === index ? "on" : undefined} />
          ))}
        </div>
        <div className="ob-row">
          <button
            type="button"
            className="ob-back"
            onClick={() => go(index - 1)}
            disabled={index === 0}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M13 8H3.5M7.5 4l-4 4 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
          {!last && (
            <button
              type="button"
              className="ob-next"
              ref={nextBtn}
              onClick={() => go(index + 1)}
            >
              Next
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 8h9.5M8.5 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

function Finale({
  delay,
  onFinish,
  isFinishing,
  error,
}: {
  delay: number;
  onFinish: () => void;
  isFinishing: boolean;
  error: string | null;
}) {
  const reduce = useReducedMotion();
  const title = SLIDE_COPY.fun.title;
  return (
    <>
      <Postcards delay={delay} />
      <div className="ob-col">
        <div className="ob-copy" style={{ gap: 14 }}>
          <span className="ob-kicker">{SLIDE_COPY.fun.kicker}</span>
          <h1
            className="ob-title ob-split"
            aria-label={title}
            style={{ fontSize: "clamp(46px, 8vw, 84px)" }}
          >
            {[...title].map((ch, k) => (
              <motion.span
                key={k}
                aria-hidden="true"
                initial={reduce ? false : { y: "110%", rotate: 8 }}
                animate={{ y: 0, rotate: 0 }}
                transition={{
                  type: "spring",
                  duration: 0.78,
                  bounce: 0.35,
                  delay: delay + k * 0.04,
                }}
              >
                {ch}
              </motion.span>
            ))}
          </h1>
          <p>{SLIDE_COPY.fun.body}</p>
        </div>
        {error ? (
          <p role="alert" className="ob-error">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="ob-cta"
          onClick={onFinish}
          disabled={isFinishing}
        >
          {isFinishing ? "Saving…" : SLIDE_COPY.fun.cta}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 8h9.5M8.5 4l4 4-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </>
  );
}
