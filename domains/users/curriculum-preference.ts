/**
 * The learner's curriculum-mode preference, as pure values and rules.
 * Database-free on purpose: the modes are needed by the onboarding screen,
 * the Sandbox, and `domains/lessons`' batch selection, and only one of
 * those has a database in reach.
 *
 * This module owns *what the modes are*. It deliberately owns neither how
 * they are worded to a learner (that is UI copy, in
 * `components/curriculum/`) nor how a batch is built from one (that is
 * `domains/lessons`' `lesson-batch.ts`, which owns batch selection).
 *
 * Originally spec 16's `theme`/`random`/`balanced`; spec 20 ("Learning
 * Queue") renamed and consolidated these to three different modes. Old
 * `theme` → `choose_group` (a rename, same behavior); old `random` *and*
 * `balanced` both → `variety` (a real, spec-mandated behavior change for
 * anyone previously in `random` — see `db/schema/user-settings.ts`'s
 * `curriculumModeEnum` docstring for the full migration story, including
 * why the database enum still contains the old labels even though nothing
 * in this codebase ever produces or expects them again after that
 * migration's backfill). `default_order` is new, not a rename.
 */

export const CURRICULUM_MODES = ["default_order", "choose_group", "variety"] as const;
export type CurriculumMode = (typeof CURRICULUM_MODES)[number];

/**
 * Spec 20 Lessons — Grammar Placement. Meaningful only in `variety` mode;
 * `default_order` always teaches grammar first and `choose_group` follows
 * the grammar curriculum's own authored order regardless, both regardless
 * of this setting (`domains/lessons/lesson-batch.ts` enforces that, not a
 * database constraint — every mode still stores a value).
 */
export const GRAMMAR_PLACEMENTS = ["first", "last", "no_preference"] as const;
export type GrammarPlacement = (typeof GRAMMAR_PLACEMENTS)[number];

export function isGrammarPlacement(value: unknown): value is GrammarPlacement {
  return typeof value === "string" && (GRAMMAR_PLACEMENTS as readonly string[]).includes(value);
}

/**
 * Spec 20 Lessons — Lesson Batch Size. The one place this range and default
 * are written down; `domains/lessons` reads `DEFAULT_LESSON_BATCH_SIZE`
 * instead of a literal `6` (lessons may depend on users, not the reverse).
 */
export const MIN_LESSON_BATCH_SIZE = 3;
export const MAX_LESSON_BATCH_SIZE = 15;
export const DEFAULT_LESSON_BATCH_SIZE = 6;

export function isValidLessonBatchSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_LESSON_BATCH_SIZE && value <= MAX_LESSON_BATCH_SIZE;
}

/** Spec 20 Lessons — Auto Pronunciation. No stated spec default, unlike every other toggle; see `db/schema/user-settings.ts`'s `autoPronounceLessons` docstring for why `true` was chosen. */
export const DEFAULT_AUTO_PRONOUNCE_LESSONS = true;

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
  /** Choose Group as You Go only, and `null` until a group is picked or after one is finished. Every other mode stores `null` — the database enforces it. */
  selectedVocabularyGroupId: string | null;
  /** Meaningful only in `variety` mode — see `GrammarPlacement`'s docstring. */
  grammarPlacement: GrammarPlacement;
  /** Spec 20 Lessons — Lesson Batch Size. The maximum preferred size of the next generated lesson; an active lesson keeps whatever size it started with. */
  lessonBatchSize: number;
  /** Spec 20 Lessons — Auto Pronunciation. Whether Lessons automatically plays pronunciation when a vocabulary item is introduced; manual controls are unaffected. */
  autoPronounceLessons: boolean;
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
 * Whether Choose Group as You Go still needs a group chosen before a lesson
 * can be built. True when the learner is in that mode and either has never
 * picked a group or the one they picked has no eligible items left — "after
 * the active group is completed, the learner chooses another."
 *
 * Takes the *eligible* group ids rather than every group in the curriculum,
 * so a finished group and a group that never existed resolve the same way.
 */
export function isThemeSelectionRequired(
  settings: LanguageSettings | null,
  availableThemeIds: readonly string[],
): boolean {
  if (settings?.curriculumMode !== "choose_group") return false;
  if (!settings.selectedVocabularyGroupId) return true;
  return !availableThemeIds.includes(settings.selectedVocabularyGroupId);
}
