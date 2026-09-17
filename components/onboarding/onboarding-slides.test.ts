import { describe, expect, it } from "vitest";

import {
  ONBOARDING_SLIDE_COUNT,
  ONBOARDING_SLIDES,
} from "@/components/onboarding/onboarding-slides";

describe("ONBOARDING_SLIDES (spec 15)", () => {
  it("has exactly the five slides the spec names, in order", () => {
    expect(ONBOARDING_SLIDES.map((slide) => slide.id)).toEqual([
      "welcome",
      "srs",
      "practice",
      "decks",
      "start",
    ]);
    expect(ONBOARDING_SLIDE_COUNT).toBe(5);
  });

  it("opens with the spec's required headline", () => {
    expect(ONBOARDING_SLIDES[0].heading).toBe("Welcome to Polyglot");
  });

  it("gives every slide its own distinct background theme", () => {
    const themes = ONBOARDING_SLIDES.map((slide) => slide.theme);
    expect(new Set(themes).size).toBe(themes.length);
  });

  it("uses semantic color tokens for those themes rather than hardcoded values", () => {
    for (const slide of ONBOARDING_SLIDES) {
      expect(slide.theme).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(slide.theme).toMatch(/^bg-/);
    }
  });

  it("gives every slide a heading, copy, and its own demonstration component", () => {
    for (const slide of ONBOARDING_SLIDES) {
      expect(slide.heading.length).toBeGreaterThan(0);
      expect(slide.copy.length).toBeGreaterThan(0);
      expect(typeof slide.Demonstration).toBe("function");
    }
  });

  it("uses a different demonstration for each slide, so none is a shared placeholder", () => {
    const demos = ONBOARDING_SLIDES.map((slide) => slide.Demonstration);
    expect(new Set(demos).size).toBe(demos.length);
  });

  it("declares demonstrations that take no props — the seam that keeps animations replaceable", () => {
    // A demonstration receiving data from the flow would couple slideshow
    // logic to the animation; spec 15 requires the opposite.
    for (const slide of ONBOARDING_SLIDES) {
      expect(slide.Demonstration.length).toBe(0);
    }
  });
});
