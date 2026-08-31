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

function framePath(basePath: string, frame: number) {
  return `${basePath}-${frame}.png`;
}

type Phase = "loading" | "playing" | "done" | "error";

export function HandwritingWord({
  basePath,
  frameCount,
  msPerFrame,
  width,
  height,
  word,
}: {
  /** Path prefix shared by every frame, e.g. "/animations/hero-here/Japanese_Here". */
  basePath: string;
  /** Total frames, numbered 1..frameCount. Frame frameCount draws first, frame 1 is complete. */
  frameCount: number;
  msPerFrame: number;
  /** Intrinsic pixel size of every frame — reserves layout space before any frame loads. */
  width: number;
  height: number;
  /** The literal word, for the always-present accessible text and the load-failure fallback. */
  word: string;
}) {
  const [prefersReducedMotion] = useState(resolveInitialReducedMotion);
  const [phase, setPhase] = useState<Phase>("loading");
  const [frame, setFrame] = useState(frameCount);

  // Preload, then either jump straight to the final frame (reduced motion) or wait for
  // every frame before starting playback so it can't flash/stall mid-sequence.
  useEffect(() => {
    let cancelled = false;

    if (prefersReducedMotion) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setFrame(1);
          setPhase("done");
        }
      };
      img.onerror = () => {
        if (!cancelled) setPhase("error");
      };
      img.src = framePath(basePath, 1);
      return () => {
        cancelled = true;
      };
    }

    let loadedCount = 0;
    let failed = false;
    const images: HTMLImageElement[] = [];

    for (let i = 1; i <= frameCount; i++) {
      const img = new Image();
      img.onload = () => {
        loadedCount += 1;
        if (!cancelled && !failed && loadedCount === frameCount) {
          setPhase("playing");
        }
      };
      img.onerror = () => {
        if (!failed) {
          failed = true;
          if (!cancelled) setPhase("error");
        }
      };
      img.src = framePath(basePath, i);
      images.push(img);
    }

    return () => {
      cancelled = true;
    };
  }, [basePath, frameCount, prefersReducedMotion]);

  // Elapsed-time-tracked rAF loop rather than one timer per frame.
  useEffect(() => {
    if (phase !== "playing") return;

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
  }, [phase, frameCount, msPerFrame]);

  if (phase === "error") {
    return <span className="text-[color:var(--accent-primary-hover)]">{word}</span>;
  }

  return (
    <span
      className="relative inline-block h-[1.05em] align-[-0.12em]"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <span className="sr-only">{word}</span>
      {(phase === "playing" || phase === "done") && (
        // eslint-disable-next-line @next/next/no-img-element -- swaps src across 31 preloaded frames every ~25ms; next/image's optimization pipeline isn't built for that.
        <img
          src={framePath(basePath, frame)}
          width={width}
          height={height}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain object-left"
        />
      )}
    </span>
  );
}
