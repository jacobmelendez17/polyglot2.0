import type { ComponentType } from "react";

import { DecksSlide } from "@/components/onboarding/slides/decks-slide";
import { PracticeSlide } from "@/components/onboarding/slides/practice-slide";
import { SrsSlide } from "@/components/onboarding/slides/srs-slide";
import { StartSlide } from "@/components/onboarding/slides/start-slide";
import { WelcomeSlide } from "@/components/onboarding/slides/welcome-slide";

/**
 * The onboarding slide registry (spec 15). This is the seam the spec's
 * "Replaceable Animations" section asks for: the flow reads `heading`,
 * `copy`, `theme`, and `Demonstration` from here and never imports a slide
 * component directly.
 *
 * Swapping a slide's visual for a custom React animation, an SVG, a Lottie
 * file, a video, or an image sequence is therefore a one-line change to the
 * `Demonstration` reference below. It cannot affect navigation, onboarding
 * state, progress tracking, completion, or slide transitions, because none
 * of those read anything from a slide component — a demonstration takes no
 * props and returns no values, so there is no timing contract for business
 * logic to couple to.
 *
 * `theme` gives each slide the distinct background spec 15 requires, composed
 * from existing semantic tokens at low opacity rather than new palette
 * values: the tint sits over `--background`, so headings and copy keep their
 * normal contrast in both light and dark mode.
 */
export type OnboardingSlide = {
  id: string;
  heading: string;
  copy: string;
  /** Background classes for the full-screen slide surface. */
  theme: string;
  /** The slide's own looping visual. Takes no props by contract — see above. */
  Demonstration: ComponentType;
};

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: "welcome",
    heading: "Welcome to Polyglot",
    copy: "A calm, structured way to actually learn Spanish — a little every day, and nothing you learn gets forgotten.",
    theme: "bg-primary/10",
    Demonstration: WelcomeSlide,
  },
  {
    id: "srs",
    heading: "Grammar and vocabulary, side by side",
    copy: "Grammar is taught as a foundation, not an afterthought. Everything you learn comes back on a schedule that gets longer as it sticks.",
    theme: "bg-learning-grammar/10",
    Demonstration: SrsSlide,
  },
  {
    id: "practice",
    heading: "Say it and hear it",
    copy: "Speaking and listening practice use your own voice and real audio, with their own progress — separate from your review schedule.",
    theme: "bg-learning-vocabulary/10",
    Demonstration: PracticeSlide,
  },
  {
    id: "decks",
    heading: "Decks for extra practice",
    copy: "Build decks from words and grammar you have already learned. Deck practice is extra study — it never changes your reviews or curriculum progress.",
    theme: "bg-accent/30",
    Demonstration: DecksSlide,
  },
  {
    id: "start",
    heading: "You're all set",
    copy: "Level 1 is unlocked and your first lesson is waiting. Take it at your own pace — Polyglot keeps track of the rest.",
    theme: "bg-srs-fluent/15",
    Demonstration: StartSlide,
  },
] as const;

export const ONBOARDING_SLIDE_COUNT = ONBOARDING_SLIDES.length;
