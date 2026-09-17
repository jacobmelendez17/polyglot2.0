import type { SrsStage } from "./srs-types";

/**
 * Spec 09 §9. Carried forward from spec 08's SRS floor — no completed review
 * item may ever be penalized below this stage. Still authoritative under
 * spec 20 SRS Strictness's five-level model (unit 12) — every strictness
 * level clamps here, "Full" resets straight to it, and the old WaniKani-
 * inspired Beginner/Familiar+ split this constant used to help compute no
 * longer exists in any form (see `review-result.ts`).
 */
export const MINIMUM_REVIEW_STAGE: SrsStage = "beginner_1";

/**
 * Review-session configuration (spec 09 §6, §8, §21). Centralized here so no
 * consumer (UI, orchestration) hardcodes these values — matching spec 07's
 * "do not read a literal N in more than one place" precedent
 * (`domains/lessons/lesson-config.ts`).
 */

const REVIEW_STATE_TOKEN_TTL_SECONDS = 60 * 60;
const REVIEW_RETRY_SPACING_MINIMUM = 3;

/** Signed review-session token lifetime (spec 09 §6 — "the exact expiration duration belongs in configuration", same as spec 07's lesson token). */
export function getReviewStateTokenTtlSeconds(): number {
  return REVIEW_STATE_TOKEN_TTL_SECONDS;
}

/** Minimum number of other questions before a failed required question becomes eligible to return (spec 09 §8). */
export function getReviewRetrySpacingMinimum(): number {
  return REVIEW_RETRY_SPACING_MINIMUM;
}

/**
 * Normal vocabulary reviews require both directions (spec 09 §7) — never
 * just one. Spec 20 Reviews' Cloze review types are the one exception:
 * `review-queue.ts`'s `buildReviewQuestions` collapses a vocabulary item to
 * a single `englishToTarget` question instead of reading this constant, per
 * that unit's recorded decision.
 */
export const VOCABULARY_REQUIRED_DIRECTIONS = [
  "targetToEnglish",
  "englishToTarget",
] as const;

/**
 * Level-unlock threshold (spec 09 §15, architecture.md's "Level Unlock
 * Architecture"). The denominator is always the level's *actual* configured
 * gating-item count (`domains/progress`'s `countLevelGatingItems`), never a
 * hardcoded number.
 */
export const LEVEL_UNLOCK_RATIO = 5 / 6;
export const LEVEL_UNLOCK_MINIMUM_STAGE: SrsStage = "familiar_1";

/**
 * Configured character helpers, keyed by language *code* (spec 09 §16 —
 * "Do not hardcode Spanish helpers into the generic answer component;
 * resolve them from language configuration"). Same shape as spec 07's
 * `domains/lessons/lesson-config.ts`'s `getCharacterHelpers`, kept as its
 * own copy rather than shared — this domain resolves a real curriculum
 * language code (`CurriculumLanguage.code`), not the fixture domain's
 * `FIXTURE_LANGUAGE_ID`, so the two functions' keys aren't even the same
 * kind of value.
 */
const CHARACTER_HELPERS_BY_LANGUAGE_CODE: Record<string, readonly string[]> = {
  "es-MX": ["á", "é", "í", "ó", "ú", "ü", "ñ"],
};

export function getCharacterHelpers(languageCode: string): readonly string[] {
  return CHARACTER_HELPERS_BY_LANGUAGE_CODE[languageCode] ?? [];
}
