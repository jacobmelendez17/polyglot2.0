import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "./in-memory";
import { RATE_LIMIT_POLICIES } from "./policies";

describe("InMemoryRateLimiter", () => {
  it("allows requests under the policy limit", async () => {
    const limiter = new InMemoryRateLimiter({ appEnv: "test" });
    const limit = RATE_LIMIT_POLICIES["lesson-complete"].maxRequests;

    for (let i = 0; i < limit; i++) {
      const result = await limiter.check({ policy: "lesson-complete", subject: "user-1" });
      expect(result.allowed).toBe(true);
    }
  });

  it("denies requests over the limit with RATE_LIMITED-shaped retry info", async () => {
    const limiter = new InMemoryRateLimiter({ appEnv: "test" });
    const limit = RATE_LIMIT_POLICIES["lesson-complete"].maxRequests;

    for (let i = 0; i < limit; i++) {
      await limiter.check({ policy: "lesson-complete", subject: "user-2" });
    }

    const result = await limiter.check({ policy: "lesson-complete", subject: "user-2" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("resets the window after it elapses", async () => {
    const limiter = new InMemoryRateLimiter({ appEnv: "test" });
    const limit = RATE_LIMIT_POLICIES["lesson-complete"].maxRequests;
    const windowMs = RATE_LIMIT_POLICIES["lesson-complete"].windowSeconds * 1000;

    for (let i = 0; i < limit; i++) {
      await limiter.check({ policy: "lesson-complete", subject: "user-3" });
    }
    expect((await limiter.check({ policy: "lesson-complete", subject: "user-3" })).allowed).toBe(false);

    const realNow = Date.now;
    Date.now = () => realNow() + windowMs + 1;
    try {
      expect((await limiter.check({ policy: "lesson-complete", subject: "user-3" })).allowed).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it("namespaces keys by APP_ENV — the same subject in two environments does not share a bucket", async () => {
    const limit = RATE_LIMIT_POLICIES["lesson-complete"].maxRequests;
    const preview = new InMemoryRateLimiter({ appEnv: "preview" });
    const production = new InMemoryRateLimiter({ appEnv: "production" });

    for (let i = 0; i < limit; i++) {
      await preview.check({ policy: "lesson-complete", subject: "user-4" });
    }
    expect((await preview.check({ policy: "lesson-complete", subject: "user-4" })).allowed).toBe(false);
    expect((await production.check({ policy: "lesson-complete", subject: "user-4" })).allowed).toBe(true);
  });

  it("identifies subjects independently — one user's usage never affects another's", async () => {
    const limiter = new InMemoryRateLimiter({ appEnv: "test" });
    const limit = RATE_LIMIT_POLICIES["lesson-complete"].maxRequests;

    for (let i = 0; i < limit; i++) {
      await limiter.check({ policy: "lesson-complete", subject: "user-5" });
    }
    expect((await limiter.check({ policy: "lesson-complete", subject: "user-5" })).allowed).toBe(false);
    expect((await limiter.check({ policy: "lesson-complete", subject: "user-6" })).allowed).toBe(true);
  });

  it("a store failure denies a fail-closed policy", async () => {
    expect(RATE_LIMIT_POLICIES["lesson-complete"].failOpen).toBe(false);
    const limiter = new InMemoryRateLimiter({ appEnv: "test", simulateFailure: () => true });

    const result = await limiter.check({ policy: "lesson-complete", subject: "user-7" });
    expect(result.allowed).toBe(false);
  });

  it("a store failure allows a policy that explicitly declares fail-open", async () => {
    // RATE_LIMIT_POLICIES has no fail-open policy today (every real policy is
    // fail-closed, per spec 08 §54's default) — the mechanism itself is
    // exercised here via a test-only policy override rather than waiting for
    // a real fail-open consumer to exist.
    const limiter = new InMemoryRateLimiter({
      appEnv: "test",
      simulateFailure: () => true,
      policies: {
        "lesson-complete": { windowSeconds: 60, maxRequests: 5, failOpen: true },
        "review-submit": { windowSeconds: 60, maxRequests: 5, failOpen: true },
      },
    });

    const result = await limiter.check({ policy: "lesson-complete", subject: "user-8" });
    expect(result.allowed).toBe(true);
  });
});
