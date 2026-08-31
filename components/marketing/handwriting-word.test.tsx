import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { HandwritingWord } from "@/components/marketing/handwriting-word";

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

const props = {
  basePath: "/x/f",
  frameCount: 31,
  msPerFrame: 25,
  width: 1800,
  height: 600,
  word: "ここ",
};

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
    expect(document.querySelector("img")).toHaveAttribute("src", "/x/f-31.png");

    raf.tick(25);
    expect(document.querySelector("img")).toHaveAttribute("src", "/x/f-30.png");

    // Jump straight to the last step.
    raf.tick(30 * 25);
    expect(document.querySelector("img")).toHaveAttribute("src", "/x/f-1.png");

    // Done — no further frame is scheduled, so it can't loop.
    expect(raf.hasPending()).toBe(false);
  });

  it("skips playback and shows the completed frame under prefers-reduced-motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    vi.stubGlobal("Image", FakeImage);

    render(<HandwritingWord {...props} />);

    await waitFor(() =>
      expect(document.querySelector("img")).toHaveAttribute("src", "/x/f-1.png")
    );
  });

  it("falls back to visible static text when a frame fails to load", async () => {
    imageLoadBehavior = "error";
    vi.stubGlobal("Image", FakeImage);

    render(<HandwritingWord {...props} />);

    await waitFor(() => expect(screen.getByText("ここ")).not.toHaveClass("sr-only"));
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("keeps the word accessible even before the sequence has loaded", () => {
    render(<HandwritingWord {...props} />);

    expect(screen.getByText("ここ")).toBeInTheDocument();
  });
});
