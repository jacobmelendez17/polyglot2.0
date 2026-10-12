import { describe, expect, it } from "vitest";

import { AdminApiError } from "./admin-api-error";
import { createAdminQueryClient } from "./admin-query-client";

describe("createAdminQueryClient", () => {
  const retry = createAdminQueryClient().getDefaultOptions().queries!.retry as (
    failureCount: number,
    error: unknown,
  ) => boolean;

  it("retries a transient failure, but only twice", () => {
    const network = new AdminApiError("NETWORK_ERROR", 0);
    expect(retry(0, network)).toBe(true);
    expect(retry(1, network)).toBe(true);
    expect(retry(2, network)).toBe(false);
  });

  it.each([
    ["FORBIDDEN", 403],
    ["UNAUTHENTICATED", 401],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["UNSUPPORTED_OPERATION", 405],
  ])("never retries %s, which a second attempt cannot fix", (code, status) => {
    expect(retry(0, new AdminApiError(code, status))).toBe(false);
  });
});
