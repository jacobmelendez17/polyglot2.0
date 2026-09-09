import { CURRICULUM_VALIDATION_CONFIG } from "@/domains/curriculum/curriculum-validation-config";
import { resolveByLanguageCode } from "@/lib/language-code";

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

/**
 * How much of a lesson batch is reserved for grammar in the Theme and
 * Balanced curriculum modes (spec 16).
 *
 * Derived from the configured curriculum shape rather than chosen: a level
 * is 48 vocabulary items to 12 grammar items, so a lesson that mirrors that
 * ratio teaches both at the pace the curriculum itself is written at, and a
 * language configured with a different shape gets a proportional batch for
 * free. At the default batch size of 6 this is one grammar item per lesson.
 *
 * Random mode ignores this entirely — spec 16 explicitly lets it mix
 * grammar and vocabulary freely.
 */
export function getLessonGrammarShare(): number {
  const { vocabularyItemsPerLevel, grammarItemsPerLevel } = CURRICULUM_VALIDATION_CONFIG;
  return grammarItemsPerLevel / (vocabularyItemsPerLevel + grammarItemsPerLevel);
}

/** Lesson-state token lifetime, per spec 07 §9 ("the exact expiration duration belongs in configuration"). */
export function getLessonTokenTtlSeconds(): number {
  return LESSON_TOKEN_TTL_SECONDS;
}

/** Minimum number of other questions before a failed question becomes eligible to return (spec 07 §33). */
export function getRetrySpacingMinimum(): number {
  return RETRY_SPACING_MINIMUM;
}

/**
 * Keyed by **language code** (`es`, `es-MX`), not by language ID.
 *
 * Before spec 07 unit 6 these were keyed by the fixture language's ID, which
 * silently stopped working the moment real UUIDs arrived: the display name
 * fell through to the raw UUID (rendering "7e33d386-… → English") and the
 * character helpers fell through to an empty list, quietly removing the
 * accent buttons. Codes are stable, human-meaningful, and shared across a
 * language's regions.
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  es: "Spanish",
};

/** Display name for a language code, for UI copy such as "Spanish → English". Data-driven, not hardcoded per language. */
export function getLanguageDisplayName(languageCode: string): string {
  return resolveByLanguageCode(LANGUAGE_DISPLAY_NAMES, languageCode) ?? languageCode;
}

const CHARACTER_HELPERS_BY_LANGUAGE: Record<string, readonly string[]> = {
  es: ["á", "é", "í", "ó", "ú", "ü", "ñ"],
};

/** Configured character helpers for a language code (spec 07 §27) — never hardcoded into the input component itself. */
export function getCharacterHelpers(languageCode: string): readonly string[] {
  return resolveByLanguageCode(CHARACTER_HELPERS_BY_LANGUAGE, languageCode) ?? [];
}
