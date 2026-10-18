import { describe, expect, it, vi } from "vitest";

import { createLivenessLimiter, handleLiveness } from "./liveness";

const request = (address = "203.0.113.9") =>
  new Request("https://polyglot.example/api/health", {
    headers: { "x-forwarded-for": address },
  });

describe("handleLiveness", () => {
  it("answers 200 with a constant body, uncached", async () => {
    const response = handleLiveness(request(), {
      limiter: createLivenessLimiter(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("gives the same answer however many times it is asked, and leaks nothing of the build", async () => {
    const limiter = createLivenessLimiter();
    const first = await handleLiveness(request(), { limiter }).text();
    const second = await handleLiveness(request(), { limiter }).text();

    expect(first).toBe(second);
    expect(first).toBe('{"status":"ok"}');
  });

  it("refuses a caller that exceeds the budget, and tells it when to return", async () => {
    const limiter = createLivenessLimiter({
      windowSeconds: 60,
      maxRequests: 2,
    });
    const now = () => 1_000_000;

    handleLiveness(request(), { limiter, now });
    handleLiveness(request(), { limiter, now });
    const refused = handleLiveness(request(), { limiter, now });

    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
    expect(await refused.json()).toEqual({ status: "rate_limited" });
  });

  it("does not let one caller spend another's budget — a flood cannot make the monitor's probe fail", () => {
    const limiter = createLivenessLimiter({
      windowSeconds: 60,
      maxRequests: 1,
    });
    const now = () => 1_000_000;

    handleLiveness(request("198.51.100.1"), { limiter, now });
    const flooder = handleLiveness(request("198.51.100.1"), { limiter, now });
    const monitor = handleLiveness(request("203.0.113.50"), { limiter, now });

    expect(flooder.status).toBe(429);
    expect(monitor.status).toBe(200);
  });

  it("checks only its own in-process limiter", () => {
    const limiter = { check: vi.fn(() => ({ allowed: true as const })) };

    handleLiveness(request(), { limiter });

    expect(limiter.check).toHaveBeenCalledTimes(1);
  });
});
