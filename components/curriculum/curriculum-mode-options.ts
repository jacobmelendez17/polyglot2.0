import type { CurriculumMode } from "@/domains/users";

/**
 * How each curriculum mode (spec 16) is described to a learner. UI copy
 * lives here rather than in `domains/users`, which owns what the modes *are*
 * and nothing about how they read — the onboarding screen, the Sandbox
 * preview, and any later Settings surface all share this one wording so the
 * three can never drift apart.
 */
export type CurriculumModeOption = {
  mode: CurriculumMode;
  label: string;
  description: string;
};

export const CURRICULUM_MODE_OPTIONS: readonly CurriculumModeOption[] = [
  {
    mode: "theme",
    label: "One theme at a time",
    description: "Work through a single topic — numbers, greetings, family — before moving to the next.",
  },
  {
    mode: "balanced",
    label: "A little of everything",
    description: "Each lesson draws evenly from every theme in your level.",
  },
  {
    mode: "random",
    label: "Surprise me",
    description: "Lessons mix words and grammar from anywhere in your level.",
  },
] as const;

export function getCurriculumModeOption(mode: CurriculumMode): CurriculumModeOption {
  // Every mode has an entry by construction (the array is exhaustive over
  // the union), so this never falls through in practice.
  return CURRICULUM_MODE_OPTIONS.find((option) => option.mode === mode) ?? CURRICULUM_MODE_OPTIONS[1]!;
}
