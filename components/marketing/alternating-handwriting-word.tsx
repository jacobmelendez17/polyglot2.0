"use client";

import { useEffect, useState } from "react";

import { HandwritingWord, type SpriteManifest } from "@/components/marketing/handwriting-word";

export type HandwritingVariant = {
  manifest: SpriteManifest;
  word: string;
};

/**
 * Cycles a `HandwritingWord` through several language variants of the same word — e.g. the
 * hero's "here" alternating between its Japanese and Korean spellings. Always starts on
 * `variants[0]` (so SSR/initial paint stays deterministic) and only advances client-side; the
 * `key` swap on `word` remounts `HandwritingWord` so each turn replays its draw-in animation
 * rather than jump-cutting to the new glyph.
 */
export function AlternatingHandwritingWord({
  variants,
  msPerFrame,
  intervalMs,
}: {
  variants: readonly HandwritingVariant[];
  msPerFrame: number;
  /** How long each variant stays on screen (draw-in time plus hold) before the next takes over. */
  intervalMs: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (variants.length < 2) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % variants.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [variants.length, intervalMs]);

  const current = variants[index];

  return (
    <HandwritingWord key={current.word} manifest={current.manifest} msPerFrame={msPerFrame} word={current.word} />
  );
}
