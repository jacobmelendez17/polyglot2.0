import type { PracticeSkill, PracticeType } from "./practice-types";

/**
 * The Practice hub's static configuration: what exists, how it is grouped,
 * and where it lives. Copy and routes are data here, not scattered through
 * components (code-standards.md — configuration-driven, no `if` ladders).
 *
 * `href` is null for every practice whose route has not shipped. The hub
 * renders a null `href` as a disabled "Coming soon" control rather than a
 * link to a 404. Shipping a practice is: build its route, set its `href`.
 */

/** Days of history behind each grove's "N in 7 days" figure. */
export const PRACTICE_ACTIVITY_WINDOW_DAYS = 7;

export type PracticeDefinition = {
  type: PracticeType;
  title: string;
  description: string;
  href: string | null;
};

export type PracticeSkillDefinition = {
  skill: PracticeSkill;
  label: string;
  tagline: string;
  practices: readonly PracticeType[];
};

export const PRACTICE_DEFINITIONS = {
  listening: {
    type: "listening",
    title: "Listening",
    description: "Hear spoken sentences and type or pick what they mean.",
    href: null,
  },
  speaking: {
    type: "speaking",
    title: "Speaking",
    description:
      "Repeat or respond using your microphone. Recordings are never stored.",
    href: null,
  },
  stories: {
    type: "stories",
    title: "Stories",
    description:
      "Short stories built from what you've learned, with tap-to-translate.",
    href: null,
  },
  sentences: {
    type: "sentences",
    title: "Sentence practice",
    description:
      "Translate sentences built from words and grammar you already know.",
    href: null,
  },
  journal: {
    type: "journal",
    title: "Journal",
    description:
      "Write an entry in the language you're learning and keep it in your personal archive.",
    href: null,
  },
  conjugation: {
    type: "conjugation",
    title: "Grammar conjugations",
    description:
      "Drill verb forms by tense and person, tracked separately from the base verb.",
    href: null,
  },
} as const satisfies Record<PracticeType, PracticeDefinition>;

export const PRACTICE_SKILL_DEFINITIONS = [
  {
    skill: "listening",
    label: "Listening",
    tagline: "Train your ear",
    practices: ["listening"],
  },
  {
    skill: "speaking",
    label: "Speaking",
    tagline: "Say it out loud",
    practices: ["speaking"],
  },
  {
    skill: "reading",
    label: "Reading",
    tagline: "Read in context",
    practices: ["stories"],
  },
  {
    skill: "writing",
    label: "Writing",
    tagline: "Build it yourself",
    practices: ["sentences", "journal"],
  },
] as const satisfies readonly PracticeSkillDefinition[];

/**
 * The default "Today's walk": a fixed short path through practices. Which
 * practices appear, and whether a learner can reshuffle them, is a product
 * decision still open (progress-tracker.md), so this is deliberately a
 * constant rather than something derived per learner.
 */
export const PRACTICE_WALK_STEPS = [
  { type: "listening", minutes: 5 },
  { type: "sentences", minutes: 10 },
  { type: "journal", minutes: 5 },
] as const satisfies readonly { type: PracticeType; minutes: number }[];

/** Route of the walk runner. Null until it exists. */
export const PRACTICE_WALK_HREF: string | null = null;

/** Route of the tests area. Null until spec-level test flows exist. */
export const PRACTICE_TESTS_HREF: string | null = null;

/** Tenses the conjugation drill covers, shown as plain tags on the hub. */
export const CONJUGATION_TENSES = [
  "Present",
  "Preterite",
  "Imperfect",
  "Future",
] as const;
