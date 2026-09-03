/**
 * Structured application errors for the review flow (spec 09 §19), per
 * architecture.md's structured-error model and code-standards.md's rule
 * against throwing arbitrary user-facing strings. Kept separate from
 * `lesson-errors.ts`/`app-error.ts` rather than merged — same reasoning as
 * `lesson-errors.ts`'s docstring: this error set is spec 09's own concern.
 */

export const REVIEW_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "ITEM_NOT_FOUND",
  "REVIEW_NOT_DUE",
  "STALE_REVIEW",
  "RATE_LIMITED",
  "INVALID_REVIEW_STATE",
  "EXPIRED_REVIEW_STATE",
] as const;

export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<ReviewErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to do that.",
  FORBIDDEN: "You don't have access to that review.",
  ITEM_NOT_FOUND: "That review item could not be found.",
  REVIEW_NOT_DUE: "That item isn't currently due for review.",
  STALE_REVIEW:
    "This review was already updated elsewhere. No additional progress change was applied.",
  RATE_LIMITED: "Please slow down and try again shortly.",
  INVALID_REVIEW_STATE: "Your review session is no longer valid. Please start a new review session.",
  EXPIRED_REVIEW_STATE: "Your review session has expired. Please start a new review session.",
};

/**
 * Thrown for expected review-domain failures. Never carries the token, its
 * decoded contents, or a learner's submitted answer — spec 09 §20's privacy
 * rule and architecture.md's Sentry/PostHog restrictions.
 */
export class ReviewError extends Error {
  readonly code: ReviewErrorCode;

  constructor(code: ReviewErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "ReviewError";
  }
}
