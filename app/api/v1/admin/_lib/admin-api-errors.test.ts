import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ADMIN_API_ERROR_STATUS } from "@/domains/admin";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

import { AdminApiRequestError, mapAdminApiError } from "./admin-api-errors";

describe("mapAdminApiError", () => {
  it.each([
    [new AppError("UNAUTHENTICATED"), "UNAUTHENTICATED", 401],
    [new AppError("FORBIDDEN"), "FORBIDDEN", 403],
    [new AppError("ITEM_NOT_FOUND"), "NOT_FOUND", 404],
    [new AdminError("CURRICULUM_ITEM_NOT_FOUND"), "NOT_FOUND", 404],
    [new AppError("CURRICULUM_VALIDATION_FAILED"), "VALIDATION_FAILED", 422],
    [new AdminError("ADMIN_EDIT_CONFLICT"), "CONFLICT", 409],
    // Spec 26 Unit 6 — role management's own refusals.
    [new AdminError("USER_NOT_FOUND"), "NOT_FOUND", 404],
    [new AdminError("USER_ROLE_CHANGE_NOT_ALLOWED"), "VALIDATION_FAILED", 422],
    [new AdminError("LAST_ADMIN"), "CONFLICT", 409],
    [new AdminError("RATE_LIMITED"), "RATE_LIMITED", 429],
    // Replaying a key with other data, or two copies racing: both are a 409.
    [new AppError("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"), "CONFLICT", 409],
    [new AppError("IDEMPOTENCY_OPERATION_IN_PROGRESS"), "CONFLICT", 409],
  ])("maps %s to %s (%i)", (error, code, status) => {
    const mapped = mapAdminApiError(error);
    expect(mapped?.code).toBe(code);
    expect(ADMIN_API_ERROR_STATUS[mapped!.code]).toBe(status);
  });

  it("maps a ZodError to a validation failure without echoing its issues", () => {
    const result = z.object({ secretField: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    const mapped = mapAdminApiError(result.error);
    expect(mapped?.code).toBe("VALIDATION_FAILED");
    expect(mapped?.message).not.toContain("secretField");
  });

  it("returns null for an unexpected error so it reaches the 500 path", () => {
    expect(mapAdminApiError(new Error("connection refused"))).toBeNull();
  });

  it("returns null for a domain error this adapter has no mapping for", () => {
    expect(mapAdminApiError(new AppError("PROVISIONING_FAILED"))).toBeNull();
  });

  describe("rate limiting", () => {
    it("carries the limiter's own wait out as a number, for the Retry-After header", () => {
      const error = new AdminError("RATE_LIMITED", "slow down", {
        retryAfterSeconds: 12.2,
      });
      expect(mapAdminApiError(error)).toMatchObject({
        code: "RATE_LIMITED",
        retryAfterSeconds: 13,
      });
    });

    it.each([
      ["no details", undefined],
      ["details without a wait", {}],
      ["a non-numeric wait", { retryAfterSeconds: "soon" }],
      ["a zero wait", { retryAfterSeconds: 0 }],
      ["a negative wait", { retryAfterSeconds: -4 }],
      ["an infinite wait", { retryAfterSeconds: Infinity }],
    ])("omits Retry-After for %s", (_name, details) => {
      const mapped = mapAdminApiError(
        new AdminError("RATE_LIMITED", "slow down", details),
      );
      expect(mapped?.code).toBe("RATE_LIMITED");
      expect(mapped).not.toHaveProperty("retryAfterSeconds");
    });
  });

  describe("requests refused at the HTTP boundary", () => {
    it.each([
      ["FORBIDDEN", 403],
      ["UNSUPPORTED_MEDIA_TYPE", 415],
      ["PAYLOAD_TOO_LARGE", 413],
      ["VALIDATION_FAILED", 422],
    ] as const)("maps %s straight through (%i)", (code, status) => {
      const mapped = mapAdminApiError(new AdminApiRequestError(code, "nope"));
      expect(mapped).toEqual({ code, message: "nope" });
      expect(ADMIN_API_ERROR_STATUS[code]).toBe(status);
    });
  });
});
