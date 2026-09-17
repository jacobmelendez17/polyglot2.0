/**
 * Structured errors for the decks feature (spec 14), per architecture.md's
 * structured-error model and code-standards.md's rule against throwing
 * arbitrary user-facing strings. Kept separate from `app-error.ts`/
 * `review-errors.ts`/`lesson-errors.ts`/`admin-errors.ts` rather than merged
 * — same reasoning as those files' own docstrings: this error set is spec
 * 14's own concern.
 */

export const DECK_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "DECK_NOT_FOUND",
  "DECK_ITEM_NOT_ELIGIBLE",
  "DECK_ITEM_NOT_FOUND",
  "DECK_MUST_HAVE_ITEMS",
  "DECK_VALIDATION_FAILED",
  "RATE_LIMITED",
] as const;

export type DeckErrorCode = (typeof DECK_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<DeckErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to do that.",
  FORBIDDEN: "You don't have access to change that deck.",
  DECK_NOT_FOUND: "That deck could not be found.",
  DECK_ITEM_NOT_ELIGIBLE: "You can only add items you have already learned.",
  DECK_ITEM_NOT_FOUND: "That item is not in this deck.",
  DECK_MUST_HAVE_ITEMS: "A deck needs at least one item.",
  DECK_VALIDATION_FAILED:
    "That deck couldn't be saved. Check the name and items and try again.",
  RATE_LIMITED: "Please slow down and try again shortly.",
};

/**
 * Thrown for expected deck-domain failures. Never carries SQL errors, stack
 * traces, or learner-private content (architecture.md's Sentry/PostHog
 * restrictions apply here too).
 */
export class DeckError extends Error {
  readonly code: DeckErrorCode;

  constructor(code: DeckErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "DeckError";
  }
}
