/**
 * Every practice activity a learner can complete. Mirrors the `practice_type`
 * database enum (`db/schema/practice.ts`); a value is added in both places.
 */
export const PRACTICE_TYPES = [
  "listening",
  "speaking",
  "stories",
  "sentences",
  "journal",
  "conjugation",
] as const;

export type PracticeType = (typeof PRACTICE_TYPES)[number];

/**
 * The four skill groves the Practice hub groups activities under. Conjugation
 * belongs to none of them — it is a Grammar drill and is presented on its own.
 */
export const PRACTICE_SKILLS = [
  "listening",
  "speaking",
  "reading",
  "writing",
] as const;

export type PracticeSkill = (typeof PRACTICE_SKILLS)[number];

export type PracticeSkillFilter = PracticeSkill | "all";

/**
 * What the hub knows about one learner's history with one practice type.
 * Aggregated by the repository so the hub never receives raw session rows.
 */
export type PracticeTypeActivity = {
  practiceType: PracticeType;
  /** Completed sessions inside the recent window (see `PRACTICE_ACTIVITY_WINDOW_DAYS`). */
  recentSessionCount: number;
  lastCompletedAt: Date;
};

/** A practice as the hub renders it. `href` is null until its route ships. */
export type PracticeCardView = {
  type: PracticeType;
  title: string;
  description: string;
  href: string | null;
  /** "2 days ago", or null when the learner has never completed this practice. */
  lastPracticedLabel: string | null;
};

export type PracticeGroveView = {
  skill: PracticeSkill;
  label: string;
  tagline: string;
  /** Completed sessions across this skill's practices inside the recent window. */
  recentSessionCount: number;
  practices: PracticeCardView[];
};

export type PracticeWalkStepView = {
  type: PracticeType;
  title: string;
  minutes: number;
  href: string | null;
};

export type PracticeWalkView = {
  totalMinutes: number;
  steps: PracticeWalkStepView[];
  /** Null until the walk runner exists; the hub then shows the walk as not yet startable. */
  startHref: string | null;
};

export type PracticeFeatureView = {
  id: "tests" | "conjugation";
  eyebrow: string;
  title: string;
  description: string;
  href: string | null;
  lastPracticedLabel: string | null;
  /** Static list of what a drill covers, shown as plain tags. */
  tags: string[];
};

export type PracticeHubView = {
  walk: PracticeWalkView;
  groves: PracticeGroveView[];
  features: PracticeFeatureView[];
};
