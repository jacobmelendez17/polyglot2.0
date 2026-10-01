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

export const CURRICULUM_MODES = [
  "default_order",
  "choose_group",
  "variety",
] as const;
export type CurriculumMode = (typeof CURRICULUM_MODES)[number];

/**
 * Choose Group as You Go's "Grammar" pseudo-theme (2026-09-27 user request —
 * "why can't I choose grammar batch in my lessons?"). `selectedVocabularyGroupId`
 * otherwise always names a real `vocabulary_groups.id`; this sentinel is the
 * one value it can hold that isn't one, meaning "study grammar only" instead
 * of a vocabulary group. Chosen and re-validated the same way any other
 * theme choice is (`domains/lessons/lesson-service.ts`'s `toThemeChoices`
 * offers it as one more entry in the same list), so every existing rule
 * about an *active* selection — asking again once it's cleared or no longer
 * available, auto-proceeding when it's the only option — applies to it
 * unchanged. The database itself never stores this string: it has its own
 * `selected_theme_is_grammar` boolean column, translated to and from this
 * sentinel only at `domains/users/user-repository.ts`'s read/write boundary,
 * since `selected_vocabulary_group_id` is a real foreign key and can't hold
 * a value that isn't a real group.
 */
export const GRAMMAR_THEME_ID = "grammar";

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
  return (
    typeof value === "string" &&
    (GRAMMAR_PLACEMENTS as readonly string[]).includes(value)
  );
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
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_LESSON_BATCH_SIZE &&
    value <= MAX_LESSON_BATCH_SIZE
  );
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
  /** Choose Group as You Go only, and `null` until a theme is picked or after one is finished. Every other mode stores `null` — the database enforces it. May be `GRAMMAR_THEME_ID` rather than a real group id — see that constant. */
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
  return (
    typeof value === "string" &&
    (CURRICULUM_MODES as readonly string[]).includes(value)
  );
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
 * can be built.
 *
 * One condition (simplified 2026-10-01, see below): **there must be a real
 * choice to make** — more than one group with anything left to study. A
 * single remaining group is nothing to choose between, so this returns
 * `false` regardless of anything else ("unless there is only one group
 * left," verbatim, user decision 2026-09-23). See the caller
 * (`domains/lessons/lesson-service.ts`'s `startLesson`) for how it resolves
 * straight to that one group without needing it already stored as the
 * learner's selection.
 *
 * **No longer considers `selectedVocabularyGroupId` at all** — a prior
 * version of this function treated a non-null stored selection as "already
 * decided, don't ask again," on the theory that it represented an
 * in-progress lesson attempt "honored for the one lesson it was made for."
 * In practice that theory didn't hold: a lesson session is an ephemeral,
 * client-held token that is simply discarded on exit or refresh (nothing
 * about leaving mid-study ever clears this field), so "the one lesson it
 * was made for" never actually ended from this function's point of view —
 * only a full completion cleared it. A learner who started a theme, studied
 * a little, and exited before finishing (completely ordinary — getting
 * interrupted, running out of time) would then have every future "Start
 * lesson" click silently resume that same theme forever, with no visible
 * indication anything was "remembered" and no way back to the picker short
 * of finishing a full lesson+quiz. User report, 2026-10-01: "whenever I
 * click start lesson it automatically puts me in a lesson session" — a
 * recurring complaint rather than a one-off, confirmed by reproducing it
 * directly (pick a theme, leave before completing, revisit `/lessons` —
 * the picker never reappears). Now: *every* fresh `/lessons` visit in
 * Choose Group as You Go asks again whenever there is a real choice,
 * full stop.
 *
 * This reintroduces the exact failure mode a past fix for *this same
 * function* was written to avoid — asking again even for the lesson the
 * learner just explicitly picked a theme for, on the very next
 * `startLesson` call the "What next?" screen's own confirm triggers, which
 * would loop back into the picker instead of starting anything (see
 * `lesson-service.test.ts`'s "Choose Group as You Go" describe block for
 * the original incident). The fix is not here: `startLesson` takes an
 * explicit `confirmedThemeId` for exactly that one call, bypassing this
 * function entirely rather than trying to infer "just confirmed" from
 * stored state — see its docstring.
 *
 * Takes the *eligible* group ids rather than every group in the curriculum,
 * so a finished group and a group that never existed count the same way —
 * neither is a real option to choose.
 */
export function isThemeSelectionRequired(
  settings: LanguageSettings | null,
  availableThemeIds: readonly string[],
): boolean {
  if (settings?.curriculumMode !== "choose_group") return false;
  return availableThemeIds.length > 1;
}
