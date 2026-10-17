import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TELEMETRY_SETTINGS,
  TELEMETRY_SWITCHES,
  summarizeTelemetryConfig,
} from "./telemetry-config";

const BASE_ENV = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk",
  CLERK_SECRET_KEY: "sk",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/dashboard",
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/dashboard",
  LESSON_STATE_SECRET: "a".repeat(32),
  REVIEW_STATE_SECRET: "b".repeat(32),
  DATABASE_URL: "postgres://example",
};

describe("env Upstash requirement", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, BASE_ENV);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("refuses to load in production without Upstash credentials", async () => {
    process.env.APP_ENV = "production";
    await expect(import("@/lib/env")).rejects.toThrow(/UPSTASH_REDIS_REST_URL/);
  });

  it("loads in production when both Upstash credentials are set", async () => {
    process.env.APP_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const { env } = await import("@/lib/env");
    expect(env.APP_ENV).toBe("production");
  });

  it("does not require Upstash in preview", async () => {
    process.env.APP_ENV = "preview";
    const { env } = await import("@/lib/env");
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
  });
});

describe("env RELEASE", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, BASE_ENV);
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("uses the Vercel git commit SHA when present", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "0123abc";
    const { env } = await import("@/lib/env");
    expect(env.RELEASE).toBe("0123abc");
  });

  it('falls back to "local" when the SHA is unset', async () => {
    const { env } = await import("@/lib/env");
    expect(env.RELEASE).toBe("local");
  });

  // Regression: `vercel pull` writes VERCEL_GIT_COMMIT_SHA="" for a CLI build
  // on a CI runner, which previously failed the whole production build with
  // "RELEASE: Too small: expected string to have >=1 characters".
  it.each(["", "   "])(
    'falls back to "local" when the SHA is blank (%j)',
    async (blank) => {
      process.env.VERCEL_GIT_COMMIT_SHA = blank;
      const { env } = await import("@/lib/env");
      expect(env.RELEASE).toBe("local");
    },
  );
});

describe("env telemetry configuration (spec 27)", () => {
  const original = { ...process.env };

  // Credentials are assembled at run time so no literal here resembles a real
  // token to a secret scanner.
  const POSTHOG_TOKEN = ["phc", "x".repeat(40)].join("_");

  const POSTHOG_SETTINGS = {
    POSTHOG_ENABLED: "true",
    POSTHOG_FREE_PLAN_CONFIRMED: "true",
    POSTHOG_PROJECT_TOKEN: POSTHOG_TOKEN,
    POSTHOG_HOST: "https://us.i.posthog.com",
  };

  const ALL_DISABLED = {
    analytics: { state: "disabled", issues: [] },
    metrics: { state: "disabled", issues: [] },
    traces: { state: "disabled", issues: [] },
    logs: { state: "disabled", issues: [] },
  };

  it("runs with every telemetry switch forced off, whatever .env.local says (vitest.config.mts)", () => {
    // `original` is the worker's environment as Vitest built it, before any
    // test below changes it.
    for (const name of TELEMETRY_SWITCHES) {
      expect(original[name], name).toBe("false");
    }
  });

  // The integration suite cannot be checked from here (it needs a database),
  // and both configs list the switches by hand — see vitest.config.mts.
  it.each(["vitest.config.mts", "vitest.integration.config.mts"])(
    "%s forces every telemetry switch off, and only the switches",
    (file) => {
      const source = readFileSync(
        path.resolve(import.meta.dirname, "..", file),
        "utf8",
      );
      const forcedOff = [...source.matchAll(/^\s*([A-Z_]+):\s*"false",?$/gm)];
      expect(forcedOff.map((match) => match[1]).sort()).toEqual(
        [...TELEMETRY_SWITCHES].sort(),
      );
    },
  );

  // scripts/e2e-server.ts starts a server and cannot be imported to test, so
  // the line that matters is checked in place.
  it("the E2E server forces every telemetry switch off", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "..", "scripts/e2e-server.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /\.\.\.Object\.fromEntries\(\s*TELEMETRY_SWITCHES\.map\(\(name\) => \[name, "false"\]\),?\s*\)/,
    );
  });

  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, BASE_ENV);
    for (const name of TELEMETRY_SETTINGS) delete process.env[name];
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("is disabled when nothing is set", async () => {
    const { telemetryConfig } = await import("@/lib/env");
    expect(summarizeTelemetryConfig(telemetryConfig)).toEqual(ALL_DISABLED);
  });

  it("never stops the application booting, however malformed the telemetry settings", async () => {
    for (const name of TELEMETRY_SETTINGS) {
      process.env[name] = "💥 not a valid value";
    }

    const { env, telemetryConfig } = await import("@/lib/env");

    expect(env.APP_ENV).toBe("development");
    expect(summarizeTelemetryConfig(telemetryConfig).analytics.state).toBe(
      "blocked",
    );
  });

  it("does not let a bad telemetry setting hide a genuinely required one", async () => {
    process.env.POSTHOG_ENABLED = "true";
    delete process.env.DATABASE_URL;

    await expect(import("@/lib/env")).rejects.toThrow(/DATABASE_URL/);
  });

  it("resolves the configuration for the APP_ENV the application runs in", async () => {
    Object.assign(process.env, POSTHOG_SETTINGS);

    process.env.APP_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const production = await import("@/lib/env");
    expect(production.telemetryConfig.analytics.state).toBe("enabled");

    vi.resetModules();
    process.env.APP_ENV = "preview";
    const preview = await import("@/lib/env");
    expect(summarizeTelemetryConfig(preview.telemetryConfig).analytics).toEqual(
      {
        state: "blocked",
        issues: [
          {
            code: "non_production_not_allowed",
            setting: "TELEMETRY_ALLOW_NON_PRODUCTION",
          },
        ],
      },
    );
  });
});
