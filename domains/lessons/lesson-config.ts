import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";

/**
 * Centralized lesson configuration. Spec 07 §2: "Do not read a literal 6 in
 * more than one place" — every consumer must go through these accessors.
 */

const DEFAULT_LESSON_BATCH_SIZE = 6;
const LESSON_TOKEN_TTL_SECONDS = 60 * 60;
const RETRY_SPACING_MINIMUM = 3;

/**
 * User-configurable lesson batch size. User settings don't exist yet (see
 * progress-tracker.md), so this always returns the default; swapping in a
 * real per-user settings lookup later is a one-function change with no
 * call-site churn.
 */
export function getLessonBatchSize(): number {
  return DEFAULT_LESSON_BATCH_SIZE;
}

/** Lesson-state token lifetime, per spec 07 §9 ("the exact expiration duration belongs in configuration"). */
export function getLessonTokenTtlSeconds(): number {
  return LESSON_TOKEN_TTL_SECONDS;
}

/** Minimum number of other questions before a failed question becomes eligible to return (spec 07 §33). */
export function getRetrySpacingMinimum(): number {
  return RETRY_SPACING_MINIMUM;
}

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  [FIXTURE_LANGUAGE_ID]: "Spanish",
};

/** Display name for a language ID, for UI copy such as "Spanish → English". Data-driven, not hardcoded per language. */
export function getLanguageDisplayName(languageId: string): string {
  return LANGUAGE_DISPLAY_NAMES[languageId] ?? languageId;
}

const CHARACTER_HELPERS_BY_LANGUAGE: Record<string, readonly string[]> = {
  [FIXTURE_LANGUAGE_ID]: ["á", "é", "í", "ó", "ú", "ü", "ñ"],
};

/** Configured character helpers for a language (spec 07 §27) — never hardcoded into the input component itself. */
export function getCharacterHelpers(languageId: string): readonly string[] {
  return CHARACTER_HELPERS_BY_LANGUAGE[languageId] ?? [];
}
