import { resolveByLanguageCode } from "@/lib/language-code";

/**
 * Centralized lesson configuration. Spec 07 §2: "Do not read a literal 6 in
 * more than one place" — every consumer must go through these accessors.
 *
 * Lesson batch size itself is no longer configured here: it is a per-user,
 * per-language preference (spec 20 Lessons) living on `LanguageSettings`.
 * `domains/users`' `DEFAULT_LESSON_BATCH_SIZE` is the one canonical default —
 * `domains/lessons` reads it from there (lessons may depend on users, not
 * the reverse) rather than duplicating the literal.
 */

const LESSON_TOKEN_TTL_SECONDS = 60 * 60;
const RETRY_SPACING_MINIMUM = 3;

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
  return (
    resolveByLanguageCode(LANGUAGE_DISPLAY_NAMES, languageCode) ?? languageCode
  );
}

const CHARACTER_HELPERS_BY_LANGUAGE: Record<string, readonly string[]> = {
  es: ["á", "é", "í", "ó", "ú", "ü", "ñ"],
};

/** Configured character helpers for a language code (spec 07 §27) — never hardcoded into the input component itself. */
export function getCharacterHelpers(languageCode: string): readonly string[] {
  return (
    resolveByLanguageCode(CHARACTER_HELPERS_BY_LANGUAGE, languageCode) ?? []
  );
}
