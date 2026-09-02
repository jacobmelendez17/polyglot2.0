"use client";

import { useEffect, useState } from "react";

// Reduced-motion preference is a static browser capability, not a value that changes
// over the component's lifetime — reading it during initial-state computation (rather
// than a post-mount effect + setState) avoids an unnecessary extra render. See
// components/shared/reveal.tsx for the same pattern.
function resolveInitialReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Shape of the JSON written by scripts/build-sprites.mjs — see that file. */
export type SpriteManifest = {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
};

type Phase = "loading" | "playing" | "done" | "error";

export function HandwritingWord({
  manifest,
  msPerFrame,
  word,
}: {
  /** The sprite sheet + grid layout produced by `npm run sprites:build`. Frame `frameCount` draws first, frame 1 is complete. */
  manifest: SpriteManifest;
  msPerFrame: number;
  /** The literal word, for the always-present accessible text and the load-failure fallback. */
  word: string;
}) {
  const [prefersReducedMotion] = useState(resolveInitialReducedMotion);
  const [phase, setPhase] = useState<Phase>("loading");
  const [frame, setFrame] = useState(manifest.frameCount);

  // Preload the one sprite sheet, then either jump straight to the final frame (reduced
  // motion) or start playback once it's fully decoded.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();

    img.onload = () => {
      if (cancelled) return;
      if (prefersReducedMotion) {
        setFrame(1);
        setPhase("done");
      } else {
        setPhase("playing");
      }
    };
    img.onerror = () => {
      if (!cancelled) setPhase("error");
    };
    img.src = manifest.image;

    return () => {
      cancelled = true;
    };
  }, [manifest.image, prefersReducedMotion]);

  // Elapsed-time-tracked rAF loop rather than one timer per frame.
  useEffect(() => {
    if (phase !== "playing") return;

    const frameCount = manifest.frameCount;
    let rafId: number;
    let startTime: number | null = null;

    function tick(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const stepsElapsed = Math.floor((timestamp - startTime!) / msPerFrame);
      const nextFrame = Math.max(frameCount - stepsElapsed, 1);
      setFrame(nextFrame);

      if (nextFrame <= 1) {
        setPhase("done");
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, manifest.frameCount, msPerFrame]);

  if (phase === "error") {
    return <span className="text-[color:var(--accent-primary-hover)]">{word}</span>;
  }

  const index = frame - 1;
  const col = index % manifest.columns;
  const row = Math.floor(index / manifest.columns);
  // Standard percentage-based CSS sprite positioning: background-size oversizes the
  // sheet to (columns*100%, rows*100%) of this element, and background-position at
  // col/(columns-1)*100% steps through each column in turn — this accounts for the
  // oversized background automatically, so it stays correct at any rendered size
  // without measuring layout in JS.
  const backgroundPositionX = manifest.columns > 1 ? (col / (manifest.columns - 1)) * 100 : 0;
  const backgroundPositionY = manifest.rows > 1 ? (row / (manifest.rows - 1)) * 100 : 0;

  return (
    <span
      className="relative inline-block h-[1.05em] align-[-0.12em]"
      style={{ aspectRatio: `${manifest.frameWidth} / ${manifest.frameHeight}` }}
    >
      <span className="sr-only">{word}</span>
      {(phase === "playing" || phase === "done") && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${manifest.image})`,
            backgroundSize: `${manifest.columns * 100}% ${manifest.rows * 100}%`,
            backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`,
            backgroundRepeat: "no-repeat",
          }}
        />
      )}
    </span>
  );
}
