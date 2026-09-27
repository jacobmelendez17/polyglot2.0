import { describe, expect, it } from "vitest";

import {
  FADE_MS,
  MELT_MS,
  SLIDE_MS,
  transitionDuration,
  transitionKind,
} from "./transitions";

describe("transitionKind", () => {
  it("uses a vertical block slide between slides 1 and 2, both directions", () => {
    expect(transitionKind(0, 1, false)).toBe("vertical");
    expect(transitionKind(1, 0, false)).toBe("vertical");
  });

  it("melts only when moving forward from slide 3 to slide 4", () => {
    expect(transitionKind(2, 3, false)).toBe("melt");
    expect(transitionKind(3, 2, false)).toBe("horizontal");
  });

  it("uses a horizontal block slide everywhere else, including skipping ahead", () => {
    expect(transitionKind(1, 2, false)).toBe("horizontal");
    expect(transitionKind(2, 1, false)).toBe("horizontal");
    expect(transitionKind(0, 3, false)).toBe("horizontal");
  });

  it("always crossfades when reduced motion is on", () => {
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 2],
      [0, 3],
    ] as const) {
      expect(transitionKind(a, b, true)).toBe("fade");
    }
  });
});

describe("transitionDuration", () => {
  it("locks navigation for exactly as long as each transition runs", () => {
    expect(transitionDuration("horizontal")).toBe(SLIDE_MS);
    expect(transitionDuration("vertical")).toBe(SLIDE_MS);
    expect(transitionDuration("melt")).toBe(MELT_MS);
    expect(transitionDuration("fade")).toBe(FADE_MS);
  });
});
