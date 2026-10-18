import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/instruments", () => ({
  recordDatabaseOperation: vi.fn(),
  recordDatabaseConnectionFailure: vi.fn(),
}));

import { CRITICAL_SETTINGS, PRODUCTION_SETTINGS } from "./readiness";
import { handleReadiness, type ReadinessDeps } from "./readiness-handler";

const SETTINGS: Record<string, string> = Object.fromEntries(
  [...CRITICAL_SETTINGS, ...PRODUCTION_SETTINGS].map((name) => [name, "set"]),
);
const request = () =>
  new Request("https://polyglot.example/api/health/ready", {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

const check = vi.fn();
const warn = vi.fn();
const execute = vi.fn();

function deps(overrides: Partial<ReadinessDeps> = {}): ReadinessDeps {
  return {
    database: { execute },
    settings: SETTINGS,
    environment: "production",
    limiter: () => ({ check }),
    warn,
    limiterTimeoutMs: 50,
    databaseTimeoutMs: 50,
    ...overrides,
  };
}

beforeEach(() => {
  check.mockReset();
  warn.mockReset();
  execute.mockReset();
  check.mockResolvedValue({ allowed: true });
  execute.mockResolvedValue([]);
});

describe("handleReadiness", () => {
  it("is 200 and ready when the settings are present and the database answers", async () => {
    const response = await handleReadiness(request(), deps());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({ status: "ready" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("is 503 when the database is down, says nothing about why in the body, and warns with a fixed reason", async () => {
    execute.mockRejectedValue(
      new Error("connect ECONNREFUSED postgres://user:hunter2@host/db"),
    );

    const response = await handleReadiness(request(), deps());
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: "unavailable" });
    for (const leak of [
      "hunter2",
      "ECONNREFUSED",
      "postgres",
      "host/db",
      "database",
      "configuration",
    ]) {
      expect(text).not.toContain(leak);
    }
    expect(warn).toHaveBeenCalledWith({
      event: "health.ready.failed",
      reason: "database_unreachable",
    });
  });

  it("is 503 when a critical setting is missing", async () => {
    const response = await handleReadiness(
      request(),
      deps({ settings: { ...SETTINGS, DATABASE_URL: "" } }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(warn).toHaveBeenCalledWith({
      event: "health.ready.failed",
      reason: "configuration_missing",
    });
  });

  it("is 503 when the database does not answer in time, and does not wait for it", async () => {
    execute.mockReturnValue(new Promise(() => undefined));
    const startedAt = Date.now();

    const response = await handleReadiness(request(), deps());

    expect(response.status).toBe(503);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("does not report PostHog or Grafana, and is unaffected by them", async () => {
    const response = await handleReadiness(
      request(),
      deps({
        settings: {
          ...SETTINGS,
          POSTHOG_ENABLED: "true",
          GRAFANA_OTLP_TOKEN: "",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /posthog|grafana|otlp/i,
    );
  });

  it("refuses a caller that has spent its budget, without touching the database", async () => {
    check.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 });

    const response = await handleReadiness(request(), deps());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(execute).not.toHaveBeenCalled();
  });

  it("limits by the caller's hashed address, under the readiness policy", async () => {
    await handleReadiness(request(), deps());

    expect(check).toHaveBeenCalledWith({
      policy: "health-ready",
      subject: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(JSON.stringify(check.mock.calls)).not.toContain("203.0.113.9");
  });

  it.each([
    [
      "the limiter fails",
      () => check.mockRejectedValue(new Error("redis is down")),
    ],
    ["the limiter cannot even be built", () => undefined],
    [
      "the limiter never answers",
      () => check.mockReturnValue(new Promise(() => undefined)),
    ],
  ])(
    "still answers truthfully when %s — a broken limiter must not look like an outage",
    async (label, arrange) => {
      arrange();
      const brokenLimiter = label.includes("built")
        ? {
            limiter: () => {
              throw new Error("Production requires UPSTASH_REDIS_REST_URL");
            },
          }
        : {};

      const response = await handleReadiness(request(), deps(brokenLimiter));

      expect(response.status).toBe(200);
      expect(execute).toHaveBeenCalledTimes(1);
    },
  );
});
