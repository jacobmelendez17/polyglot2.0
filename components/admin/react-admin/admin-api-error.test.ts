import { HttpError } from "react-admin";
import { describe, expect, it } from "vitest";

import {
  AdminApiError,
  describeAdminError,
  isAdminApiError,
  isDenial,
} from "./admin-api-error";

describe("AdminApiError", () => {
  it("is a React Admin HttpError, so authProvider.checkError can read .status", () => {
    const error = new AdminApiError("FORBIDDEN", 403);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(403);
  });

  it("keeps its own identity despite HttpError resetting the prototype", () => {
    const error = new AdminApiError("FORBIDDEN", 403);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(isAdminApiError(error)).toBe(true);
    expect(error.name).toBe("AdminApiError");
  });

  it.each([
    ["UNAUTHENTICATED", 401, "unauthenticated"],
    ["FORBIDDEN", 403, "forbidden"],
    ["NOT_FOUND", 404, "not_found"],
    ["CONFLICT", 409, "conflict"],
    ["VALIDATION_FAILED", 422, "validation"],
    ["RATE_LIMITED", 429, "rate_limited"],
    ["UNSUPPORTED_OPERATION", 405, "unsupported"],
    ["NETWORK_ERROR", 0, "network"],
    ["INVALID_RESPONSE", 500, "invalid_response"],
    ["INTERNAL_ERROR", 500, "server"],
  ])("classifies %s (%i) as %s", (code, status, kind) => {
    expect(new AdminApiError(code, status).kind).toBe(kind);
  });

  it("falls back to the HTTP status when the code is unrecognised", () => {
    expect(new AdminApiError("SOMETHING_NEW", 403).kind).toBe("forbidden");
    expect(new AdminApiError("SOMETHING_NEW", 401).kind).toBe(
      "unauthenticated",
    );
    expect(new AdminApiError("SOMETHING_NEW", 503).kind).toBe("server");
  });

  it("never shows server-supplied text, only its own safe message", () => {
    const error = new AdminApiError(
      "INTERNAL_ERROR",
      500,
      'select * from "users" failed',
    );
    expect(error.message).not.toContain("select");
    // The detail is for logs/tests; it is not the message.
    expect(error.detail).toContain("select");
  });
});

describe("describeAdminError", () => {
  it("offers a retry for failures a second attempt could fix", () => {
    for (const code of ["NETWORK_ERROR", "INTERNAL_ERROR", "RATE_LIMITED"]) {
      expect(describeAdminError(new AdminApiError(code, 500)).retryable).toBe(
        true,
      );
    }
  });

  it("offers no retry for permanent denials", () => {
    expect(
      describeAdminError(new AdminApiError("FORBIDDEN", 403)).retryable,
    ).toBe(false);
    expect(
      describeAdminError(new AdminApiError("NOT_FOUND", 404)).retryable,
    ).toBe(false);
  });

  it("describes an unknown thrown value as a generic, retryable server problem", () => {
    expect(describeAdminError(new Error("boom"))).toEqual({
      kind: "server",
      message: "Something went wrong on our side. Please try again.",
      retryable: true,
    });
  });
});

describe("the server's own wording", () => {
  const withMessage = (code: string, status: number, serverMessage: string) =>
    new AdminApiError(code, status, undefined, { serverMessage });

  // These are sentences written for the person reading them, and the next step
  // depends on them: "changed after you opened it" vs "no unpublished changes".
  it.each([
    [
      "CONFLICT",
      409,
      "This item changed after you opened it. Reload the latest version.",
    ],
    ["VALIDATION_FAILED", 422, "There are no unpublished changes to publish."],
    ["NOT_FOUND", 404, "That curriculum item could not be found."],
    ["RATE_LIMITED", 429, "Please slow down and try again in 17s."],
  ])("shows it for %s", (code, status, sentence) => {
    expect(withMessage(code, status, sentence).message).toBe(sentence);
    expect(
      describeAdminError(withMessage(code, status, sentence)).message,
    ).toBe(sentence);
  });

  // Everything else keeps a message of ours: a server fault, a sign-in
  // problem, or a permission denial must never reach a screen verbatim.
  it.each([
    ["INTERNAL_ERROR", 500],
    ["FORBIDDEN", 403],
    ["UNAUTHENTICATED", 401],
    ["NETWORK_ERROR", 0],
    ["INVALID_RESPONSE", 500],
    ["UNSUPPORTED_OPERATION", 405],
  ])("never shows it for %s (%i)", (code, status) => {
    const error = withMessage(
      code,
      status,
      'ERROR: relation "users" does not exist',
    );
    expect(error.message).not.toContain("relation");
  });

  it("falls back to its own message when the server sent none, or only whitespace", () => {
    expect(new AdminApiError("CONFLICT", 409).message).toContain(
      "changed after you opened it",
    );
    expect(withMessage("CONFLICT", 409, "   \n  ").message).toContain(
      "changed after you opened it",
    );
  });

  it("renders plain, single-line, bounded text", () => {
    expect(
      withMessage("VALIDATION_FAILED", 422, "line one\n\n   line   two")
        .message,
    ).toBe("line one line two");
    expect(
      withMessage("VALIDATION_FAILED", 422, "x".repeat(5000)).message,
    ).toHaveLength(200);
  });

  it("carries the server's Retry-After on the error", () => {
    const error = new AdminApiError("RATE_LIMITED", 429, undefined, {
      retryAfterSeconds: 17,
    });
    expect(error.retryAfterSeconds).toBe(17);
    expect(
      new AdminApiError("RATE_LIMITED", 429).retryAfterSeconds,
    ).toBeUndefined();
  });

  it("treats a rate limit as retryable, and a conflict or validation failure as not", () => {
    expect(
      describeAdminError(new AdminApiError("RATE_LIMITED", 429)).retryable,
    ).toBe(true);
    expect(
      describeAdminError(new AdminApiError("CONFLICT", 409)).retryable,
    ).toBe(false);
    expect(
      describeAdminError(new AdminApiError("VALIDATION_FAILED", 422)).retryable,
    ).toBe(false);
  });
});

describe("isDenial", () => {
  it("is true for a signed-out or not-allowed failure — a second attempt cannot fix either", () => {
    expect(isDenial({ kind: "forbidden" })).toBe(true);
    expect(isDenial({ kind: "unauthenticated" })).toBe(true);
  });

  it.each([
    "not_found",
    "conflict",
    "validation",
    "rate_limited",
    "unsupported",
    "network",
    "invalid_response",
    "server",
  ] as const)(
    "is false for %s — something a person can act on or retry",
    (kind) => {
      expect(isDenial({ kind })).toBe(false);
    },
  );

  it("is false for no failure at all", () => {
    expect(isDenial(null)).toBe(false);
  });
});
