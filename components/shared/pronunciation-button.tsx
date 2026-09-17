"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { browserSpeechSynthesisProvider } from "@/providers/speech/speech-synthesis-provider";
import { cn } from "@/lib/utils";

type PronunciationButtonProps = {
  /** The target-language text to pronounce. */
  text: string;
  /** `languages.code`, e.g. `es-MX` — used to pick a voice. */
  languageCode: string;
  /** A real recording, preferred over synthesis whenever the item has one. */
  audioUrl?: string | null;
  /** What the control is pronouncing, for its accessible label — e.g. `el gato`, or the sentence. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

/** Speech-synthesis availability never changes during a session, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};
const readSupport = () => browserSpeechSynthesisProvider.isSupported();
/** The server cannot know; assuming supported keeps the button enabled in the overwhelmingly common case, and `useSyncExternalStore` corrects it on hydration without a mismatch warning. */
const readServerSupport = () => true;

/**
 * Plays a word or sentence aloud (spec 18).
 *
 * A real recording wins whenever one exists; otherwise this falls back to
 * the browser's speech synthesis (the user's 2026-09-09 decision). The
 * distinction is invisible to the learner on purpose — when the `media`
 * domain lands and items gain real audio, the same button starts playing it
 * with no change here or at any call site.
 *
 * Support is read through `useSyncExternalStore`, not in the render body and
 * not in an effect: `window.speechSynthesis` does not exist during SSR, so
 * reading it directly while rendering produces a hydration mismatch — the
 * bug already recorded against `components/shared/reveal.tsx`. This hook
 * exists for exactly this shape of problem and hands React a separate server
 * snapshot instead.
 *
 * A browser with neither a recording nor synthesis gets a disabled control
 * with a stated reason rather than a dead button.
 */
export function PronunciationButton({
  text,
  languageCode,
  audioUrl,
  label,
  size = "md",
  className,
}: PronunciationButtonProps) {
  const canSynthesize = useSyncExternalStore(
    subscribeToNothing,
    readSupport,
    readServerSupport,
  );
  const [isPlaying, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any in-flight playback when the component goes away — navigating
  // to the next item mid-word should not leave it talking.
  useEffect(() => {
    return () => {
      browserSpeechSynthesisProvider.cancel();
      audioRef.current?.pause();
    };
  }, []);

  const isAvailable = Boolean(audioUrl) || canSynthesize;
  const spokenLabel = label ?? text;

  function handleClick() {
    if (isPlaying) {
      browserSpeechSynthesisProvider.cancel();
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    if (audioUrl) {
      const audio = (audioRef.current ??= new Audio(audioUrl));
      audio.currentTime = 0;
      audio.onended = () => setPlaying(false);
      // A blocked or failed load must not leave the control stuck in a
      // "playing" state it can never leave.
      audio.onerror = () => setPlaying(false);
      setPlaying(true);
      void audio.play().catch(() => setPlaying(false));
      return;
    }

    setPlaying(true);
    browserSpeechSynthesisProvider.speak({
      text,
      languageCode,
      onEnd: () => setPlaying(false),
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isAvailable}
      aria-label={
        isAvailable
          ? `Play pronunciation of ${spokenLabel}`
          : `Pronunciation of ${spokenLabel} is unavailable in this browser`
      }
      title={
        isAvailable
          ? undefined
          : "This browser cannot play pronunciation audio."
      }
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-primary transition-colors",
        "hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        isPlaying && "bg-primary/10",
        className,
      )}
    >
      {isAvailable ? (
        <Volume2
          className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
          aria-hidden="true"
        />
      ) : (
        <VolumeX
          className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
