import type { SrsStage } from "./srs-types";

/**
 * Spec 09 §9. Carried forward from spec 08's SRS floor — no completed review
 * item may ever be penalized below this stage.
 */
export const MINIMUM_REVIEW_STAGE: SrsStage = "beginner_1";

/**
 * Beginner 1-4 use a flat penalty regardless of how many required
 * directions/types were wrong — spec 09 §9 is explicit that both vocabulary
 * directions incorrect still costs exactly one stage.
 */
export const BEGINNER_PENALTY_STAGES = 1;
const BEGINNER_TIER: readonly SrsStage[] = ["beginner_1", "beginner_2", "beginner_3", "beginner_4"];

/**
 * Familiar 1 and above use `incorrect_adjustment_count * penalty_factor`.
 * Confirmed decision (2026-09-02, resolving spec 09 §9's "Open Question #1"):
 * `incorrect_adjustment_count` is capped at 1 per completed item, mirroring
 * the Beginner tier's flat rule — an item is never penalized more than
 * `FAMILIAR_PLUS_PENALTY_FACTOR` stages no matter how many distinct required
 * directions/types were wrong.
 */
export const FAMILIAR_PLUS_PENALTY_FACTOR = 2;
export const MAX_INCORRECT_ADJUSTMENT_COUNT_PER_ITEM = 1;

export function isBeginnerTier(stage: SrsStage): boolean {
  return BEGINNER_TIER.includes(stage);
}

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

/** Normal vocabulary reviews require both directions (spec 09 §7) — never just one. */
export const VOCABULARY_REQUIRED_DIRECTIONS = ["targetToEnglish", "englishToTarget"] as const;

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
