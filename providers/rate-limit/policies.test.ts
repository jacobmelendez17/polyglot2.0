import { describe, expect, it } from "vitest";

import { RATE_LIMIT_POLICIES } from "./policies";

describe("the Admin user-management policies (spec 26 Unit 6)", () => {
  it("fail closed: if the limiter cannot be reached, a role is not changed and accounts are not listed", () => {
    expect(RATE_LIMIT_POLICIES["admin-role-change"].failOpen).toBe(false);
    expect(RATE_LIMIT_POLICIES["admin-user-search"].failOpen).toBe(false);
  });

  it("budget role changes more tightly than ordinary Admin edits — it is the most privileged thing the console does", () => {
    expect(RATE_LIMIT_POLICIES["admin-role-change"].maxRequests).toBeLessThan(
      RATE_LIMIT_POLICIES["admin-mutation"].maxRequests,
    );
    expect(RATE_LIMIT_POLICIES["admin-role-change"].windowSeconds).toBe(
      RATE_LIMIT_POLICIES["admin-mutation"].windowSeconds,
    );
  });

  it("bound account searches to what a person typing and paging could do in a minute", () => {
    const { maxRequests, windowSeconds } =
      RATE_LIMIT_POLICIES["admin-user-search"];
    expect(windowSeconds).toBe(60);
    expect(maxRequests).toBeGreaterThanOrEqual(20);
    expect(maxRequests).toBeLessThanOrEqual(60);
  });
});
