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

describe("the analytics-intent policy (spec 27 Unit 27.3)", () => {
  it("fails closed: if the limiter cannot be reached, an analytics event is dropped rather than let through", () => {
    expect(RATE_LIMIT_POLICIES["analytics-intent"].failOpen).toBe(false);
  });

  it("allows what a person starting sessions could do in a minute, and is tighter than ordinary Settings saves would be for a script", () => {
    const { maxRequests, windowSeconds } =
      RATE_LIMIT_POLICIES["analytics-intent"];
    expect(windowSeconds).toBe(60);
    expect(maxRequests).toBeGreaterThanOrEqual(10);
    expect(maxRequests).toBeLessThanOrEqual(60);
  });
});

describe("the health policies (spec 27 Unit 27.7)", () => {
  it.each(["health-live", "health-ready"] as const)(
    "%s fails open, so a limiter outage can never make a probe report an outage",
    (policy) => {
      expect(RATE_LIMIT_POLICIES[policy].failOpen).toBe(true);
    },
  );

  it("leaves the five-minute external check far below either budget, and holds readiness tighter because it reaches the database", () => {
    const live = RATE_LIMIT_POLICIES["health-live"];
    const ready = RATE_LIMIT_POLICIES["health-ready"];
    // One check every five minutes is one request per 300 seconds.
    expect(live.maxRequests).toBeGreaterThanOrEqual(30);
    expect(ready.maxRequests).toBeGreaterThanOrEqual(6);
    expect(ready.maxRequests).toBeLessThan(live.maxRequests);
    expect(live.windowSeconds).toBe(60);
    expect(ready.windowSeconds).toBe(60);
  });
});
