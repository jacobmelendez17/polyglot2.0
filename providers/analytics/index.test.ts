import { beforeEach, describe, expect, it, vi } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

// `server-only` throws outside a Server Component, which is exactly what it is
// for; a unit test stands in for the server.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("@/lib/env", () => ({
  telemetryConfig: {
    analytics: {
      state: "blocked",
      issues: [
        { code: "plan_not_confirmed", setting: "POSTHOG_FREE_PLAN_CONFIRMED" },
      ],
    },
  },
}));

describe("getAnalyticsProvider", () => {
  beforeEach(() => {
    warn.mockClear();
    // The provider is cached per module instance; start each test fresh.
    vi.resetModules();
  });

  it("resolves the provider once per server instance, so a blocked configuration is reported once, not on every request", async () => {
    const { getAnalyticsProvider } = await import("./index");

    const first = getAnalyticsProvider();
    const second = getAnalyticsProvider();
    getAnalyticsProvider();

    expect(second).toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "telemetry.config.blocked",
        provider: "posthog",
      }),
    );
  });

  it("returns a provider that is safe to call whatever the configuration", async () => {
    const { getAnalyticsProvider } = await import("./index");
    const provider = getAnalyticsProvider();

    expect(() =>
      provider.capture({ event: "lesson_started", distinctId: "analytics-1" }),
    ).not.toThrow();
    await expect(provider.flush()).resolves.toBeUndefined();
  });
});
