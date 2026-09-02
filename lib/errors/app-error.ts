/**
 * Structured application errors for spec 08's database-backed domains
 * (users, curriculum, progress, idempotency), per architecture.md's
 * structured-error model ({ code, message }) and code-standards.md's rule
 * against throwing arbitrary user-facing strings. Kept separate from
 * `lesson-errors.ts` rather than merging the two — the lesson flow's error
 * set is spec 07's own concern and doesn't need to grow every time a new
 * database domain adds a code.
 */

export const APP_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "ITEM_NOT_FOUND",
  "CURRICULUM_VALIDATION_FAILED",
  "RATE_LIMITED",
  "PROVISIONING_FAILED",
  "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
  "IDEMPOTENCY_OPERATION_IN_PROGRESS",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to do that.",
  FORBIDDEN: "You don't have access to do that.",
  ITEM_NOT_FOUND: "That item could not be found.",
  CURRICULUM_VALIDATION_FAILED: "That curriculum content couldn't be validated.",
  RATE_LIMITED: "Please slow down and try again shortly.",
  PROVISIONING_FAILED: "Your account could not be set up. Please try again.",
  IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: "This request has already been made with different data.",
  IDEMPOTENCY_OPERATION_IN_PROGRESS: "This request is already being processed.",
};

/**
 * Thrown for expected database-domain failures. Never carries connection
 * strings, raw SQL errors, or learner-private content (notes, synonyms,
 * typed answers) — see architecture.md's Sentry/PostHog restrictions.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "AppError";
  }
}
