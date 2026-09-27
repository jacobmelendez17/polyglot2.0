"use client";

// Slide 2: three characters (Tagalog, Spanish, French). Tapping one makes it hop,
// shows a speech bubble with a translation, and speaks the phrase in its language.
// Art is optional: without an image each character is a dashed placeholder.

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimate,
  useReducedMotion,
} from "motion/react";

import {
  ONBOARDING_CAST,
  type OnboardingCharacter,
  type Tone,
} from "./lib/content";
import { onboardingSpeech, type SpeechProvider } from "./lib/speech";

const TONE_VAR: Record<Tone, string> = {
  pink: "var(--ob-pink)",
  gold: "var(--ob-marigold)",
  accent: "var(--ob-accent)",
};

type CharacterCastProps = {
  cast?: OnboardingCharacter[];
  speech?: SpeechProvider;
};

export function CharacterCast({
  cast = ONBOARDING_CAST,
  speech = onboardingSpeech,
}: CharacterCastProps) {
  const [talking, setTalking] = useState<string | null>(null);
  useEffect(() => () => speech.cancel(), [speech]);

  return (
    <div className="ob-cast">
      {cast.map((character, i) => (
        <Character
          key={character.key}
          character={character}
          delay={-0.4 - i}
          talking={talking === character.key}
          onSpeak={async () => {
            setTalking(character.key);
            await speech.speak(character.phrase, character.locale, {
              audioUrl: character.audioUrl,
            });
            setTalking((key) => (key === character.key ? null : key));
          }}
        />
      ))}
    </div>
  );
}

function Character({
  character,
  delay,
  talking,
  onSpeak,
}: {
  character: OnboardingCharacter;
  delay: number;
  talking: boolean;
  onSpeak: () => void;
}) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const [bubble, setBubble] = useState(false);

  // The bubble opens on tap and lingers a moment after speech ends.
  useEffect(() => {
    if (talking || !bubble) return;
    const timer = setTimeout(() => setBubble(false), 900);
    return () => clearTimeout(timer);
  }, [talking, bubble]);

  function tap() {
    setBubble(true);
    if (!reduce && scope.current) {
      // squash and stretch hop
      animate(
        scope.current,
        {
          scaleX: [1, 1.12, 0.92, 1.03, 1],
          scaleY: [1, 0.86, 1.1, 0.97, 1],
          y: [0, 0, -14, 0, 0],
        },
        { duration: 0.7, times: [0, 0.18, 0.45, 0.75, 1], ease: "easeOut" },
      );
    }
    onSpeak();
  }

  return (
    <button
      type="button"
      className={`ob-char${talking ? " is-talking" : ""}`}
      style={{
        ["--c" as string]: TONE_VAR[character.tone],
        ["--d" as string]: `${delay}s`,
      }}
      aria-label={`${character.name} character. Tap to hear: ${character.phrase}`}
      onClick={tap}
    >
      <span className="ob-char-bob">
        <AnimatePresence>
          {bubble && (
            <motion.span
              className="ob-say"
              aria-hidden="true"
              initial={reduce ? false : { scale: 0, opacity: 0, x: "-50%" }}
              animate={{
                scale: 1,
                opacity: 1,
                x: "-50%",
                transition: { type: "spring", stiffness: 420, damping: 18 },
              }}
              exit={{
                scale: 0.6,
                opacity: 0,
                x: "-50%",
                transition: { duration: 0.26, ease: "easeIn" },
              }}
              style={{ originX: 0.5, originY: 1 }}
            >
              {character.phrase}
              <small>{character.translation}</small>
            </motion.span>
          )}
        </AnimatePresence>
        <span className="ob-char-fig" ref={scope}>
          <span className="ob-char-lift">
            {character.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- character art is decorative and sized by the layout
              <img src={character.image} alt="" />
            ) : (
              <span className="ob-ph">
                <svg
                  viewBox="0 0 100 120"
                  style={{ color: TONE_VAR[character.tone] }}
                  aria-hidden="true"
                >
                  <circle cx="50" cy="34" r="22" fill="currentColor" />
                  <path
                    d="M14 118c0-26 16-50 36-50s36 24 36 50z"
                    fill="currentColor"
                  />
                </svg>
                <b>{character.name} character</b>
                <code>{character.key}.png</code>
              </span>
            )}
          </span>
        </span>
        <span className="ob-waves" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="ob-char-floor" aria-hidden="true" />
      <span className="ob-char-tag">
        <i aria-hidden="true" />
        {character.name}
      </span>
    </button>
  );
}
