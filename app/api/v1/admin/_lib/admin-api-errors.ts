import { z } from "zod";

import type { AdminApiErrorCode } from "@/domains/admin";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

export type MappedAdminApiError = {
  code: AdminApiErrorCode;
  message: string;
};

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
  if (error instanceof z.ZodError) {
    return {
      code: "VALIDATION_FAILED",
      message: "That request could not be understood.",
    };
  }
  if (error instanceof AppError || error instanceof AdminError) {
    const code = codeFor(error.code);
    return code ? { code, message: error.message } : null;
  }
  return null;
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
      return "NOT_FOUND";
    case "CURRICULUM_VALIDATION_FAILED":
      return "VALIDATION_FAILED";
    case "ADMIN_EDIT_CONFLICT":
      return "CONFLICT";
    default:
      return null;
  }
}
