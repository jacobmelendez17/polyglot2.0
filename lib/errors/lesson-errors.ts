/**
 * Structured application errors for the lesson flow, per architecture.md's
 * structured-error model ({ code, message }) and code-standards.md's rule
 * against throwing arbitrary user-facing strings.
 */

export const LESSON_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "ITEM_NOT_FOUND",
  "LESSON_ITEM_NOT_ELIGIBLE",
  "CURRICULUM_VALIDATION_FAILED",
  "RATE_LIMITED",
  "LESSON_STATE_INVALID",
  "LESSON_STATE_EXPIRED",
  "LESSON_ALREADY_ENROLLED",
  "LESSON_QUIZ_NOT_READY",
] as const;

export type LessonErrorCode = (typeof LESSON_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<LessonErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to do that.",
  FORBIDDEN: "You don't have access to that lesson.",
  ITEM_NOT_FOUND: "That lesson item could not be found.",
  LESSON_ITEM_NOT_ELIGIBLE: "That item isn't currently eligible for a lesson.",
  CURRICULUM_VALIDATION_FAILED: "That lesson content couldn't be validated.",
  RATE_LIMITED: "Please slow down and try again shortly.",
  LESSON_STATE_INVALID: "Your lesson session is no longer valid. Please start a new lesson.",
  LESSON_STATE_EXPIRED: "Your lesson session has expired. Please start a new lesson.",
  LESSON_ALREADY_ENROLLED: "These items have already been learned.",
  LESSON_QUIZ_NOT_READY: "You need to study every item before starting the quiz.",
};

/**
 * Thrown for expected lesson-domain failures. Never carries the token, its
 * decoded contents, or a learner's submitted answer — see §7's Observability
 * rule and architecture.md's Sentry/PostHog restrictions.
 */
export class LessonError extends Error {
  readonly code: LessonErrorCode;

  constructor(code: LessonErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "LessonError";
  }
}
