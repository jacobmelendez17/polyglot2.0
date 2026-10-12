import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ADMIN_API_ERROR_STATUS } from "@/domains/admin";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

import { mapAdminApiError } from "./admin-api-errors";

describe("mapAdminApiError", () => {
  it.each([
    [new AppError("UNAUTHENTICATED"), "UNAUTHENTICATED", 401],
    [new AppError("FORBIDDEN"), "FORBIDDEN", 403],
    [new AppError("ITEM_NOT_FOUND"), "NOT_FOUND", 404],
    [new AdminError("CURRICULUM_ITEM_NOT_FOUND"), "NOT_FOUND", 404],
    [new AppError("CURRICULUM_VALIDATION_FAILED"), "VALIDATION_FAILED", 422],
    [new AdminError("ADMIN_EDIT_CONFLICT"), "CONFLICT", 409],
    [new AdminError("RATE_LIMITED"), "RATE_LIMITED", 429],
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
});
