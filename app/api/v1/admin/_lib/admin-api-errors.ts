import { z } from "zod";

import type { AdminApiErrorCode } from "@/domains/admin";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

export type MappedAdminApiError = {
  code: AdminApiErrorCode;
  message: string;
  /** Seconds until a rate-limited caller may retry; becomes the `Retry-After` header. */
  retryAfterSeconds?: number;
};

/**
 * A request refused at the HTTP boundary itself (wrong origin, wrong content
 * type, too large, unreadable) — before any domain code ran. It carries the
 * API error code directly because there is no domain error to translate.
 */
export class AdminApiRequestError extends Error {
  readonly code: AdminApiErrorCode;

  constructor(code: AdminApiErrorCode, message: string) {
    super(message);
    this.name = "AdminApiRequestError";
    this.code = code;
  }
}

/**
 * Translates an *expected* failure into the Admin adapter's error codes
 * (spec 26 §3 "API errors"): 401 / 403 / 404 / 422 / 409 / 429. Returns
 * `null` for anything else so the caller re-throws it — an unexpected error
 * must reach `withRouteTrace` (logged at ERROR, answered with a generic
 * 500), never be disguised as a tidy 4xx.
 *
 * Domain messages are passed through only for the codes whose default text
 * is already written for end users (`AppError`/`AdminError` never carry SQL
 * or internals — see their own docstrings). A `ZodError`'s issues are
 * deliberately dropped: they describe the request's shape, which is no one's
 * business but the caller's, and the caller sent it.
 */
export function mapAdminApiError(error: unknown): MappedAdminApiError | null {
  if (error instanceof AdminApiRequestError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "VALIDATION_FAILED",
      message: "That request could not be understood.",
    };
  }
  if (error instanceof AppError || error instanceof AdminError) {
    const code = codeFor(error.code);
    if (!code) return null;
    const retryAfterSeconds = retryAfterOf(error);
    return {
      code,
      message: error.message,
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    };
  }
  return null;
}

/** The rate limiter's own wait, when the domain error carries it (`AdminError` `details`). */
function retryAfterOf(error: AppError | AdminError): number | undefined {
  if (!(error instanceof AdminError)) return undefined;
  const details = error.details as { retryAfterSeconds?: unknown } | undefined;
  const seconds = details?.retryAfterSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : undefined;
}

function codeFor(domainCode: string): AdminApiErrorCode | null {
  switch (domainCode) {
    case "UNAUTHENTICATED":
      return "UNAUTHENTICATED";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "ITEM_NOT_FOUND":
    case "CURRICULUM_ITEM_NOT_FOUND":
    case "USER_NOT_FOUND":
      return "NOT_FOUND";
    case "CURRICULUM_VALIDATION_FAILED":
    // The target cannot be given a role through this command (yourself, a
    // sandbox persona, an account with no Clerk identity, the role it already
    // has): the request is understood and refused — not a lack of access.
    case "USER_ROLE_CHANGE_NOT_ALLOWED":
      return "VALIDATION_FAILED";
    case "ADMIN_EDIT_CONFLICT":
    // The change would remove the last Admin: a state the request collides
    // with, which another Admin could resolve — a conflict, not a mistake.
    case "LAST_ADMIN":
    // Replaying a key with different data, or two copies of one command racing:
    // both mean "this exact request cannot be applied as sent" — a 409.
    case "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH":
    case "IDEMPOTENCY_OPERATION_IN_PROGRESS":
      return "CONFLICT";
    default:
      return null;
  }
}
