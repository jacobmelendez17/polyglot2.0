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
const { PostHogAnalyticsProvider } = await import("./posthog");

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

  it("is the PostHog adapter, and sends to PostHog's own host and nowhere else, when fully enabled", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(ENABLED, "production").analytics,
    );

    expect(provider).toBeInstanceOf(PostHogAnalyticsProvider);
    expect(warn).not.toHaveBeenCalled();

    // The guard refuses every real send and reports it, so what the adapter
    // *tried* to reach is the whole of what it would have sent.
    const attempts = await recordOutboundAttempts(() => useProvider(provider));
    expect(attempts).toEqual([{ via: "fetch", target: "us.i.posthog.com" }]);
  });

  it("uses the configured region's host", async () => {
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(
        { ...ENABLED, POSTHOG_HOST: "https://eu.i.posthog.com" },
        "production",
      ).analytics,
    );

    const attempts = await recordOutboundAttempts(() => useProvider(provider));
    expect(attempts).toEqual([{ via: "fetch", target: "eu.i.posthog.com" }]);
  });

  it("hands the adapter the fetch it was given, so a test can see exactly what would be sent", async () => {
    const sent: string[] = [];
    const provider = createAnalyticsProvider(
      parseTelemetryConfig(ENABLED, "production").analytics,
      {
        fetch: (async (url: string | URL | Request) => {
          sent.push(String(url));
          return new Response("{}", { status: 200 });
        }) as typeof fetch,
      },
    );

    await useProvider(provider);

    expect(sent).toEqual(["https://us.i.posthog.com/batch/"]);
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
