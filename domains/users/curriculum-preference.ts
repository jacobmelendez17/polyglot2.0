/**
 * The learner's curriculum-mode preference (spec 16), as pure values and
 * rules. Database-free on purpose: the modes are needed by the onboarding
 * screen, the Sandbox, and `domains/lessons`' batch selection, and only one
 * of those has a database in reach.
 *
 * This module owns *what the modes are*. It deliberately owns neither how
 * they are worded to a learner (that is UI copy, in
 * `components/curriculum/`) nor how a batch is built from one (that is
 * `domains/lessons`' `lesson-batch.ts`, which owns batch selection).
 */

export const CURRICULUM_MODES = ["theme", "random", "balanced"] as const;
export type CurriculumMode = (typeof CURRICULUM_MODES)[number];

/**
 * A learner's settings for one language. `null` from a lookup means "has
 * never chosen", which is what routes them to the preference screen — never
 * "chose the default", because there is no default: spec 16 asks the
 * learner rather than assuming.
 */
export type LanguageSettings = {
  userId: string;
  languageId: string;
  curriculumMode: CurriculumMode;
  /** Theme mode only, and `null` until a theme is picked or after one is finished. Every other mode stores `null` — the database enforces it. */
  selectedVocabularyGroupId: string | null;
};

/** Narrows an untrusted value (a form field, a URL parameter) to a real mode. Validation still belongs at the boundary; this is what the boundary checks against. */
export function isCurriculumMode(value: unknown): value is CurriculumMode {
  return typeof value === "string" && (CURRICULUM_MODES as readonly string[]).includes(value);
}

/**
 * Whether this learner still owes a curriculum choice for this language.
 * A sandbox persona never does: like onboarding, a testing fixture must not
 * be trapped on a preference screen the admin opened the sandbox to look
 * past. The Sandbox sets a persona's mode explicitly instead.
 */
export function isCurriculumChoiceRequired(
  user: { isSandbox: boolean },
  settings: LanguageSettings | null,
): boolean {
  if (user.isSandbox) return false;
  return settings === null;
}

/**
 * Whether Theme mode still needs a theme chosen before a lesson can be
 * built. True when the learner is in Theme mode and either has never picked
 * a theme or the one they picked has no eligible items left — spec 16's
 * "After a theme is completed, the learner chooses another available theme".
 *
 * Takes the *eligible* theme ids rather than every theme in the curriculum,
 * so a finished theme and a theme that never existed resolve the same way.
 */
export function isThemeSelectionRequired(
  settings: LanguageSettings | null,
  availableThemeIds: readonly string[],
): boolean {
  if (settings?.curriculumMode !== "theme") return false;
  if (!settings.selectedVocabularyGroupId) return true;
  return !availableThemeIds.includes(settings.selectedVocabularyGroupId);
}
