/**
 * Structured errors for Admin curriculum-management mutations (spec 11
 * rewrite's "Validation" section), per architecture.md's structured-error
 * model. Kept separate from `app-error.ts`/`review-errors.ts`/
 * `lesson-errors.ts` rather than merged — same reasoning as those files'
 * own docstrings: this error set is this workflow's own concern.
 */

export const ADMIN_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "ADMIN_EDIT_CONFLICT",
  "CURRICULUM_ITEM_NOT_FOUND",
  "CURRICULUM_VALIDATION_FAILED",
  "DUPLICATE_ITEM",
  "DUPLICATE_REVIEW_REQUIRED",
  "ITEM_REFERENCED",
  "IMPORT_FILE_INVALID",
  "SANDBOX_NOT_FOUND",
  "SANDBOX_OPERATION_FORBIDDEN",
  "LEVEL_ONE_NOT_CONFIGURED",
  "RATE_LIMITED",
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<AdminErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to do that.",
  FORBIDDEN: "You don't have access to do that.",
  ADMIN_EDIT_CONFLICT: "This item changed after you opened it. Reload the latest version before saving or publishing.",
  CURRICULUM_ITEM_NOT_FOUND: "That curriculum item could not be found.",
  CURRICULUM_VALIDATION_FAILED: "That curriculum content couldn't be validated.",
  DUPLICATE_ITEM: "A matching item already exists. Resolve the duplicate before continuing.",
  DUPLICATE_REVIEW_REQUIRED: "This near-duplicate needs a decision before it can be saved.",
  ITEM_REFERENCED: "This item has existing learner progress and cannot be permanently deleted. It will be archived instead.",
  IMPORT_FILE_INVALID: "This file couldn't be read as a vocabulary import.",
  SANDBOX_NOT_FOUND: "No sandbox exists for this account.",
  SANDBOX_OPERATION_FORBIDDEN: "That sandbox operation isn't allowed.",
  LEVEL_ONE_NOT_CONFIGURED: "Level 1 is not configured for this language yet.",
  RATE_LIMITED: "Please slow down and try again shortly.",
};

/** Thrown for expected Admin-mutation failures. Never carries SQL errors, stack traces, or internal DB structures (architecture.md's Sentry/PostHog restrictions apply here too). */
export class AdminError extends Error {
  readonly code: AdminErrorCode;
  /** Structured, safe-to-display extra context — e.g. `DUPLICATE_ITEM`'s matching candidates. Never sensitive/internal data. */
  readonly details?: unknown;

  constructor(code: AdminErrorCode, message?: string, details?: unknown) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "AdminError";
    this.details = details;
  }
}
