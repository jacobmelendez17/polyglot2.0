import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import {
  AlternatingHandwritingWord,
  type HandwritingVariant,
} from "@/components/marketing/alternating-handwriting-word";
import type { SpriteManifest } from "@/components/marketing/handwriting-word";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this._src;
  }
}

function manifest(overrides: Partial<SpriteManifest> = {}): SpriteManifest {
  return {
    image: "/sprites/x.deadbeef.png",
    frameWidth: 100,
    frameHeight: 100,
    columns: 1,
    rows: 1,
    frameCount: 1,
    ...overrides,
  };
}

const VARIANTS: readonly HandwritingVariant[] = [
  {
    manifest: manifest({ image: "/sprites/jap.png" }),
    word: "ここ",
    msPerFrame: 25,
  },
  {
    manifest: manifest({ image: "/sprites/kor.png" }),
    word: "여기",
    msPerFrame: 25,
  },
];

describe("AlternatingHandwritingWord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts on the first variant so initial render is deterministic", () => {
    render(
      <AlternatingHandwritingWord variants={VARIANTS} intervalMs={4000} />,
    );

    expect(screen.getByText("ここ")).toBeInTheDocument();
  });

  it("advances to the next variant once intervalMs elapses, looping back at the end", async () => {
    render(
      <AlternatingHandwritingWord variants={VARIANTS} intervalMs={4000} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("여기")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("ここ")).toBeInTheDocument();
  });

  it("never advances when only a single variant is given", async () => {
    render(
      <AlternatingHandwritingWord variants={[VARIANTS[0]]} intervalMs={4000} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByText("ここ")).toBeInTheDocument();
  });
});
