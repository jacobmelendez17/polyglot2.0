import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { HandwritingWord, type SpriteManifest } from "@/components/marketing/handwriting-word";

let imageLoadBehavior: "success" | "error" = "success";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      if (imageLoadBehavior === "error") this.onerror?.();
      else this.onload?.();
    });
  }

  get src() {
    return this._src;
  }
}

function stubRaf() {
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
  });
  return {
    tick(timestamp: number) {
      const cb = pending;
      pending = null;
      if (cb) act(() => cb(timestamp));
    },
    hasPending: () => pending !== null,
  };
}

const manifest: SpriteManifest = {
  image: "/sprites/x.deadbeef.png",
  frameWidth: 1800,
  frameHeight: 600,
  columns: 6,
  rows: 6,
  frameCount: 31,
};

const props = {
  manifest,
  msPerFrame: 25,
  word: "ここ",
};

/** Reads the currently-displayed frame's background-position off the sprite layer. */
function currentBackgroundPosition() {
  const layer = document.querySelector('[aria-hidden="true"]');
  return (layer as HTMLElement | null)?.style.backgroundPosition ?? null;
}

function positionForFrame(frame: number) {
  const index = frame - 1;
  const col = index % manifest.columns;
  const row = Math.floor(index / manifest.columns);
  const x = manifest.columns > 1 ? (col / (manifest.columns - 1)) * 100 : 0;
  const y = manifest.rows > 1 ? (row / (manifest.rows - 1)) * 100 : 0;
  return `${x}% ${y}%`;
}

describe("HandwritingWord", () => {
  beforeEach(() => {
    imageLoadBehavior = "success";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays every frame from 31 down to 1, once, then stops", async () => {
    vi.stubGlobal("Image", FakeImage);
    const raf = stubRaf();

    render(<HandwritingWord {...props} />);

    await waitFor(() => expect(raf.hasPending()).toBe(true));

    // First tick only establishes the start time — still on the starting frame.
    raf.tick(0);
    expect(currentBackgroundPosition()).toBe(positionForFrame(31));

    raf.tick(25);
    expect(currentBackgroundPosition()).toBe(positionForFrame(30));

    // Jump straight to the last step.
    raf.tick(30 * 25);
    expect(currentBackgroundPosition()).toBe(positionForFrame(1));

    // Done — no further frame is scheduled, so it can't loop.
    expect(raf.hasPending()).toBe(false);
  });

  it("skips playback and shows the completed frame under prefers-reduced-motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    vi.stubGlobal("Image", FakeImage);

    render(<HandwritingWord {...props} />);

    await waitFor(() => expect(currentBackgroundPosition()).toBe(positionForFrame(1)));
  });

  it("preloads only the single sprite sheet, not one request per frame", async () => {
    const srcs: string[] = [];
    class TrackingImage extends FakeImage {
      set src(value: string) {
        srcs.push(value);
        super.src = value;
      }
      get src() {
        return super.src;
      }
    }
    vi.stubGlobal("Image", TrackingImage);
    stubRaf();

    render(<HandwritingWord {...props} />);

    await waitFor(() => expect(srcs).toHaveLength(1));
    expect(srcs[0]).toBe(manifest.image);
  });

  it("falls back to visible static text when the sprite fails to load", async () => {
    imageLoadBehavior = "error";
    vi.stubGlobal("Image", FakeImage);

    render(<HandwritingWord {...props} />);

    await waitFor(() => expect(screen.getByText("ここ")).not.toHaveClass("sr-only"));
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("keeps the word accessible even before the sequence has loaded", () => {
    render(<HandwritingWord {...props} />);

    expect(screen.getByText("ここ")).toBeInTheDocument();
  });
});
