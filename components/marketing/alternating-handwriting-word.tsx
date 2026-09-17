"use client";

import { useEffect, useState } from "react";

import {
  HANDWRITING_DEFAULT_HEIGHT_EM,
  HandwritingWord,
  type SpriteManifest,
} from "@/components/marketing/handwriting-word";

export type HandwritingVariant = {
  manifest: SpriteManifest;
  word: string;
  /** Milliseconds each frame stays on screen — lower draws faster. Total draw time = frameCount * msPerFrame. */
  msPerFrame: number;
  /** Rendered height, in `em`. Defaults to `HandwritingWord`'s own default (1.05) when omitted. */
  heightEm?: number;
};

function heightEmOf(variant: HandwritingVariant) {
  return variant.heightEm ?? HANDWRITING_DEFAULT_HEIGHT_EM;
}

function widthEmOf(variant: HandwritingVariant) {
  return (
    heightEmOf(variant) *
    (variant.manifest.frameWidth / variant.manifest.frameHeight)
  );
}

/**
 * Cycles a `HandwritingWord` through several language variants of the same word — e.g. the
 * hero's "here" alternating between its Japanese and Korean spellings. Always starts on
 * `variants[0]` (so SSR/initial paint stays deterministic) and only advances client-side; the
 * `key` swap on `word` remounts `HandwritingWord` so each turn replays its draw-in animation
 * rather than jump-cutting to the new glyph. Each variant sets its own `msPerFrame` since
 * different frame counts need different per-frame speeds to feel similarly paced.
 *
 * Variants may also differ in `heightEm` (e.g. a taller Korean glyph next to a smaller
 * Japanese one). If each variant sized only itself, switching would resize the inline
 * element and reflow the whole headline — and everything below it — every few seconds.
 * This renders a fixed-size box, sized once to the *largest* variant.
 *
 * The centered `HandwritingWord` is `position: absolute` inside that box rather than a
 * flex child. An `inline-flex` box looked fixed-size (confirmed via measurement: its own
 * border box never changed), but a flex container still synthesizes its *inline baseline*
 * from its content, not its explicit height — so the parent `<h1>`'s line box kept growing
 * and shrinking by exactly the child's height delta even though the box itself didn't
 * move. Taking the child out of flow entirely removes any path for its size to reach the
 * line box.
 */
export function AlternatingHandwritingWord({
  variants,
  intervalMs,
}: {
  variants: readonly HandwritingVariant[];
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
  const boxHeightEm = Math.max(...variants.map(heightEmOf));
  const boxWidthEm = Math.max(...variants.map(widthEmOf));

  return (
    <span
      className="relative inline-block align-[-0.12em]"
      style={{ height: `${boxHeightEm}em`, width: `${boxWidthEm}em` }}
    >
      <span className="absolute inset-0 flex items-center justify-center">
        <HandwritingWord
          key={current.word}
          manifest={current.manifest}
          msPerFrame={current.msPerFrame}
          word={current.word}
          heightEm={current.heightEm}
        />
      </span>
    </span>
  );
}
