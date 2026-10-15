import { AdminApiError } from "../admin-api-error";

/**
 * A dictionary Server Action's refusal (`{ code, message }`, its own error set)
 * as the console's one error type, so the shared command dialog can say what
 * happened and offer only what could help (a stale view → "Reload the list", a
 * lost permission → "Close"). The message is the action's own wording for the
 * kinds whose wording is the point; a server fault keeps the console's fixed
 * sentence (see `AdminApiError`).
 */
export function dictionaryActionError(error: {
  code: string;
  message: string;
}): AdminApiError {
  switch (error.code) {
    case "UNAUTHENTICATED":
      return new AdminApiError("UNAUTHENTICATED", 401);
    case "FORBIDDEN":
      return new AdminApiError("FORBIDDEN", 403);
    case "RATE_LIMITED":
      return new AdminApiError("RATE_LIMITED", 429, undefined, {
        serverMessage: error.message,
      });
    case "VALIDATION_FAILED":
      return new AdminApiError("VALIDATION_FAILED", 422, undefined, {
        serverMessage: error.message,
      });
    case "VOCABULARY_ITEM_NOT_FOUND":
    case "MAPPING_NOT_FOUND":
      return new AdminApiError("NOT_FOUND", 404, undefined, {
        serverMessage: error.message,
      });
    case "MAPPING_LOCKED":
      return new AdminApiError("CONFLICT", 409, undefined, {
        serverMessage: error.message,
      });
    default:
      return new AdminApiError("INTERNAL_ERROR", 500, error.code);
  }
}
