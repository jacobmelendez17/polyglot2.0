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
      "Follow the authored curriculum sequence — grammar first, then each vocabulary group in order.",
  },
  {
    mode: "choose_group",
    label: "Choose Group as You Go",
    description:
      "Work through a single vocabulary group — numbers, greetings, family — before choosing the next.",
  },
  {
    mode: "variety",
    label: "Variety",
    description:
      "Each lesson draws a little from every available vocabulary group.",
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
