import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseTelemetryConfig } from "@/lib/telemetry-config";

import { recordOutboundAttempts } from "../test-support/outbound-network-guard";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

const { createAnalyticsProvider } = await import("./create-analytics-provider");
const { noopAnalyticsProvider } = await import("./noop");

// Assembled at run time so no literal here resembles a real PostHog token.
const PROJECT_TOKEN = ["phc", "x".repeat(40)].join("_");

const ENABLED = {
  POSTHOG_ENABLED: "true",
  POSTHOG_FREE_PLAN_CONFIRMED: "true",
  POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN,
  POSTHOG_HOST: "https://us.i.posthog.com",
};

/** Everything a caller can do with a provider. */
async function useProvider(
  provider: ReturnType<typeof createAnalyticsProvider>,
) {
  provider.capture({
    event: "lesson_completed",
    distinctId: "analytics-id-1",
    properties: { level: 1, item_count: 6 },
    dedupeKey: "completion-1",
  });
  await provider.flush();
  await provider.shutdown();
}

describe("createAnalyticsProvider", () => {
  beforeEach(() => warn.mockClear());

  it("is the no-op, and makes zero outbound requests, when analytics is disabled", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig({}, "production").analytics,
    );

    expect(provider).toBe(noopAnalyticsProvider);
    expect(await recordOutboundAttempts(() => useProvider(provider))).toEqual(
      [],
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("is the no-op when the switch is off, even with a complete, valid configuration beside it", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(
        { ...ENABLED, POSTHOG_ENABLED: "false" },
        "production",
      ).analytics,
    );

    expect(provider).toBe(noopAnalyticsProvider);
    expect(await recordOutboundAttempts(() => useProvider(provider))).toEqual(
      [],
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("fails closed when enabled with invalid credentials: a no-op, no requests, and one warning that names settings and nothing else", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(
        {
          POSTHOG_ENABLED: "true",
          POSTHOG_PROJECT_TOKEN: PROJECT_TOKEN.replace("phc_", "phx_"),
          POSTHOG_HOST: "https://collector.attacker.example/capture",
        },
        "production",
      ).analytics,
    );

    expect(provider).toBe(noopAnalyticsProvider);
    expect(await recordOutboundAttempts(() => useProvider(provider))).toEqual(
      [],
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      event: "telemetry.config.blocked",
      provider: "posthog",
      issues: [
        { code: "plan_not_confirmed", setting: "POSTHOG_FREE_PLAN_CONFIRMED" },
        { code: "invalid_setting", setting: "POSTHOG_PROJECT_TOKEN" },
        { code: "invalid_setting", setting: "POSTHOG_HOST" },
      ],
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(PROJECT_TOKEN.slice(4));
    expect(logged).not.toContain("attacker.example");
  });

  it("blocks a non-production environment that has not been explicitly allowed", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(ENABLED, "preview").analytics,
    );

    expect(provider).toBe(noopAnalyticsProvider);
    expect(await recordOutboundAttempts(() => useProvider(provider))).toEqual(
      [],
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        issues: [
          {
            code: "non_production_not_allowed",
            setting: "TELEMETRY_ALLOW_NON_PRODUCTION",
          },
        ],
      }),
    );
  });

  // The honest state of Unit 27.1: no vendor adapter exists, so even a valid,
  // confirmed production configuration cannot send anything. Unit 27.3 returns
  // the PostHog adapter here and replaces this test with the adapter's own
  // (injected fake transport, after-commit and consent cases).
  it("is still the no-op, with zero requests, when fully enabled — the PostHog adapter does not exist yet", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(ENABLED, "production").analytics,
    );

    expect(provider).toBe(noopAnalyticsProvider);
    expect(await recordOutboundAttempts(() => useProvider(provider))).toEqual(
      [],
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("noopAnalyticsProvider", () => {
  it("accepts any call, returns nothing, and resolves flush and shutdown", async () => {
    expect(
      noopAnalyticsProvider.capture({ event: "x", distinctId: "y" }),
    ).toBeUndefined();
    await expect(noopAnalyticsProvider.flush()).resolves.toBeUndefined();
    await expect(noopAnalyticsProvider.shutdown()).resolves.toBeUndefined();
  });
});
