import { describe, expect, it } from "vitest";

import { clientKey } from "./client-key";
import { BoundedWindowLimiter } from "./local-limiter";
import { healthResponse, rateLimitedResponse } from "./respond";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("clientKey", () => {
  it("is a short, stable hash that does not contain the address", () => {
    const key = clientKey(headers({ "x-forwarded-for": "203.0.113.9" }));

    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).not.toContain("203");
    expect(clientKey(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(key);
  });

  it("tells callers apart", () => {
    expect(clientKey(headers({ "x-forwarded-for": "203.0.113.9" }))).not.toBe(
      clientKey(headers({ "x-forwarded-for": "203.0.113.10" })),
    );
  });

  it("uses the first address of a forwarded chain, which is the client's", () => {
    expect(
      clientKey(
        headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" }),
      ),
    ).toBe(clientKey(headers({ "x-forwarded-for": "203.0.113.9" })));
  });

  it("falls back to x-real-ip, then to one shared bucket", () => {
    expect(clientKey(headers({ "x-real-ip": "198.51.100.7" }))).toBe(
      clientKey(headers({ "x-forwarded-for": "198.51.100.7" })),
    );
    expect(clientKey(headers({}))).toBe(
      clientKey(headers({ "x-forwarded-for": "" })),
    );
  });
});

describe("BoundedWindowLimiter", () => {
  const limiter = (maxKeys?: number) =>
    new BoundedWindowLimiter({ windowSeconds: 60, maxRequests: 3, maxKeys });

  it("allows up to the budget, then says when to come back", () => {
    const l = limiter();
    const t0 = 1_000_000;

    expect(l.check("a", t0)).toEqual({ allowed: true });
    expect(l.check("a", t0 + 1_000)).toEqual({ allowed: true });
    expect(l.check("a", t0 + 2_000)).toEqual({ allowed: true });
    expect(l.check("a", t0 + 10_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 50,
    });
  });

  it("keeps callers apart and starts a new window when the old one ends", () => {
    const l = limiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) l.check("a", t0);

    expect(l.check("a", t0).allowed).toBe(false);
    expect(l.check("b", t0).allowed).toBe(true);
    expect(l.check("a", t0 + 60_000).allowed).toBe(true);
  });

  it("never holds more callers than its bound, however many addresses arrive", () => {
    const l = limiter(50);
    const t0 = 1_000_000;

    for (let i = 0; i < 5_000; i += 1) l.check(`caller-${i}`, t0 + i);

    expect(l.size).toBeLessThanOrEqual(50);
  });

  it("drops expired entries before it evicts live ones", () => {
    const l = limiter(3);
    const t0 = 1_000_000;
    l.check("old-1", t0);
    l.check("old-2", t0);
    l.check("live", t0 + 59_000);

    l.check("incoming", t0 + 61_000); // old-1 and old-2 have expired

    expect(l.size).toBe(2);
    // "live" kept its window: its count survived.
    l.check("live", t0 + 61_500);
    l.check("live", t0 + 61_600);
    expect(l.check("live", t0 + 61_700).allowed).toBe(false);
  });

  it("evicts the oldest caller when everything is live, so an evicted caller simply starts over", () => {
    const l = limiter(2);
    const t0 = 1_000_000;
    l.check("first", t0);
    l.check("first", t0);
    l.check("first", t0);
    l.check("second", t0 + 1);

    l.check("third", t0 + 2);

    expect(l.size).toBe(2);
    expect(l.check("first", t0 + 3).allowed).toBe(true);
  });
});

describe("healthResponse", () => {
  it("is never cached, is JSON, and carries only what it was given", async () => {
    const response = healthResponse(200, { status: "ok" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("sets no cookie and exposes no server or build header", () => {
    const response = healthResponse(200, { status: "ok" });

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("server")).toBeNull();
    expect(response.headers.get("x-powered-by")).toBeNull();
  });
});

describe("rateLimitedResponse", () => {
  it("is a 429 that says when to retry and is not cached", async () => {
    const response = rateLimitedResponse(12.2);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("13");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({ status: "rate_limited" });
  });

  it("never asks to retry in zero seconds", () => {
    expect(rateLimitedResponse(0).headers.get("retry-after")).toBe("1");
  });
});
