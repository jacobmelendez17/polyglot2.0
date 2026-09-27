import type { CurriculumMode } from "@/domains/users";

/**
 * How each Learning Queue mode (spec 20, renamed/consolidated from spec
 * 16's Theme/Random/Balanced) is described to a learner. UI copy lives here
 * rather than in `domains/users`, which owns what the modes *are* and
 * nothing about how they read — the onboarding screen, the Sandbox preview,
 * and `/settings/lessons` all share this one wording so the three can never
 * drift apart.
 */
export type CurriculumModeOption = {
  mode: CurriculumMode;
  label: string;
  description: string;
};

export const CURRICULUM_MODE_OPTIONS: readonly CurriculumModeOption[] = [
  {
    mode: "default_order",
    label: "Default Order",
    description:
      "The Polyglot way. Learn your grammar lessons and then vocabulary groups after.",
  },
  {
    mode: "choose_group",
    label: "Theme Selection",
    description:
      "Choose the theme you'd like to learn next every time you start new lessons.",
  },
  {
    mode: "variety",
    label: "Variety",
    description:
      "Randomized selection of all the words in a level. Grammar will still be taught in order.",
  },
] as const;

export function getCurriculumModeOption(
  mode: CurriculumMode,
): CurriculumModeOption {
  // Every mode has an entry by construction (the array is exhaustive over
  // the union), so this never falls through in practice.
  return (
    CURRICULUM_MODE_OPTIONS.find((option) => option.mode === mode) ??
    CURRICULUM_MODE_OPTIONS[0]!
  );
}
