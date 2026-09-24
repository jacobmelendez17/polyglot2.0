import { formatRelativeTime } from "@/lib/time/format-relative-time";

import {
  CONJUGATION_TENSES,
  PRACTICE_DEFINITIONS,
  PRACTICE_SKILL_DEFINITIONS,
  PRACTICE_TESTS_HREF,
  PRACTICE_WALK_HREF,
  PRACTICE_WALK_STEPS,
} from "./practice-catalog";
import {
  PRACTICE_SKILLS,
  type PracticeCardView,
  type PracticeFeatureView,
  type PracticeGroveView,
  type PracticeHubView,
  type PracticeSkillFilter,
  type PracticeType,
  type PracticeTypeActivity,
  type PracticeWalkView,
} from "./practice-types";

/** Number of dots in a grove's activity row. Purely visual; the count beside it is exact. */
export const PRACTICE_ACTIVITY_DOT_COUNT = 5;

/** Reads the `?skill=` URL param. Anything unrecognized falls back to `"all"`. */
export function parsePracticeSkillFilter(
  value: string | undefined,
): PracticeSkillFilter {
  return PRACTICE_SKILLS.find((skill) => skill === value) ?? "all";
}

/** How many of a grove's activity dots are lit for a session count. */
export function countLitActivityDots(recentSessionCount: number): number {
  return Math.min(Math.max(recentSessionCount, 0), PRACTICE_ACTIVITY_DOT_COUNT);
}

export function filterGroves(
  groves: readonly PracticeGroveView[],
  filter: PracticeSkillFilter,
): PracticeGroveView[] {
  return filter === "all"
    ? [...groves]
    : groves.filter((grove) => grove.skill === filter);
}

function toCardView(
  type: PracticeType,
  activityByType: ReadonlyMap<PracticeType, PracticeTypeActivity>,
  now: Date,
): PracticeCardView {
  const definition = PRACTICE_DEFINITIONS[type];
  const activity = activityByType.get(type);
  return {
    type,
    title: definition.title,
    description: definition.description,
    href: definition.href,
    lastPracticedLabel: activity
      ? formatRelativeTime(activity.lastCompletedAt, now)
      : null,
  };
}

function buildWalk(): PracticeWalkView {
  const steps = PRACTICE_WALK_STEPS.map(({ type, minutes }) => ({
    type,
    title: PRACTICE_DEFINITIONS[type].title,
    minutes,
    href: PRACTICE_DEFINITIONS[type].href,
  }));

  // A walk is startable only when its runner exists *and* every step it
  // strings together does, so it switches on by itself as practices ship.
  const isStartable =
    PRACTICE_WALK_HREF !== null && steps.every((step) => step.href !== null);

  return {
    totalMinutes: steps.reduce((total, step) => total + step.minutes, 0),
    steps,
    startHref: isStartable ? PRACTICE_WALK_HREF : null,
  };
}

function buildFeatures(
  activityByType: ReadonlyMap<PracticeType, PracticeTypeActivity>,
  now: Date,
): PracticeFeatureView[] {
  const conjugation = toCardView("conjugation", activityByType, now);
  return [
    {
      id: "tests",
      eyebrow: "Testing",
      title: "Tests",
      description:
        "Module, theme, and level tests. Review past attempts and retake to improve.",
      href: PRACTICE_TESTS_HREF,
      lastPracticedLabel: null,
      tags: [],
    },
    {
      id: "conjugation",
      eyebrow: "Grammar",
      title: conjugation.title,
      description: conjugation.description,
      href: conjugation.href,
      lastPracticedLabel: conjugation.lastPracticedLabel,
      tags: [...CONJUGATION_TENSES],
    },
  ];
}

/**
 * Pure composition of the Practice hub from static configuration plus one
 * learner's aggregated activity. `now` is injected (code-standards.md) and is
 * used only to word "last practiced" labels — nothing here decides
 * eligibility or unlocks.
 */
export function buildPracticeHubView(
  activity: readonly PracticeTypeActivity[],
  now: Date,
): PracticeHubView {
  const activityByType = new Map(
    activity.map((entry) => [entry.practiceType, entry]),
  );

  const groves = PRACTICE_SKILL_DEFINITIONS.map(
    ({ skill, label, tagline, practices }): PracticeGroveView => ({
      skill,
      label,
      tagline,
      recentSessionCount: practices.reduce(
        (total, type) =>
          total + (activityByType.get(type)?.recentSessionCount ?? 0),
        0,
      ),
      practices: practices.map((type) => toCardView(type, activityByType, now)),
    }),
  );

  return {
    walk: buildWalk(),
    groves,
    features: buildFeatures(activityByType, now),
  };
}
