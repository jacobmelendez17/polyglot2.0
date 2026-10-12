import { HttpError } from "react-admin";
import { describe, expect, it } from "vitest";

import {
  AdminApiError,
  describeAdminError,
  isAdminApiError,
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
