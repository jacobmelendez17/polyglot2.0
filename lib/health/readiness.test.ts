import { beforeEach, describe, expect, it, vi } from "vitest";

const recordDatabaseOperation = vi.hoisted(() => vi.fn());
const recordDatabaseConnectionFailure = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/instruments", () => ({
  recordDatabaseOperation,
  recordDatabaseConnectionFailure,
}));

import {
  checkConfiguration,
  checkDatabase,
  checkReadiness,
  CRITICAL_SETTINGS,
  PRODUCTION_SETTINGS,
} from "./readiness";

const FULL: Record<string, string> = Object.fromEntries(
  [...CRITICAL_SETTINGS, ...PRODUCTION_SETTINGS].map((name) => [name, "set"]),
);

beforeEach(() => {
  recordDatabaseOperation.mockReset();
  recordDatabaseConnectionFailure.mockReset();
});

describe("checkConfiguration", () => {
  it("is ok when every critical setting is present", () => {
    expect(checkConfiguration(FULL, "production")).toBe("ok");
    expect(checkConfiguration(FULL, "development")).toBe("ok");
  });

  it.each(CRITICAL_SETTINGS)("fails when %s is missing", (name) => {
    expect(
      checkConfiguration({ ...FULL, [name]: undefined }, "development"),
    ).toBe("failed");
  });

  it.each(["", "   ", 0, null, undefined])("treats %j as not set", (value) => {
    expect(
      checkConfiguration({ ...FULL, DATABASE_URL: value }, "development"),
    ).toBe("failed");
  });

  it("requires the rate-limit store in production only", () => {
    const withoutRedis = { ...FULL };
    for (const name of PRODUCTION_SETTINGS) delete withoutRedis[name];

    expect(checkConfiguration(withoutRedis, "production")).toBe("failed");
    expect(checkConfiguration(withoutRedis, "preview")).toBe("ok");
    expect(checkConfiguration(withoutRedis, "development")).toBe("ok");
  });

  it("does not care about optional telemetry settings", () => {
    expect(checkConfiguration(FULL, "production")).toBe("ok");
    expect(CRITICAL_SETTINGS.join()).not.toMatch(/POSTHOG|GRAFANA|TELEMETRY/);
    expect(PRODUCTION_SETTINGS.join()).not.toMatch(/POSTHOG|GRAFANA|TELEMETRY/);
  });
});

describe("checkDatabase", () => {
  it("is ok when the database answers, and records the timing", async () => {
    const database = { execute: vi.fn(async () => [{ "?column?": 1 }]) };

    await expect(
      checkDatabase(database, { environment: "production" }),
    ).resolves.toBe("ok");

    expect(database.execute).toHaveBeenCalledTimes(1);
    expect(recordDatabaseOperation).toHaveBeenCalledWith({
      environment: "production",
      operation: "readiness_check",
      outcome: "success",
      durationMs: expect.any(Number),
    });
    expect(recordDatabaseConnectionFailure).not.toHaveBeenCalled();
  });

  it("fails, and counts a connection failure, when the database errors", async () => {
    const database = {
      execute: vi.fn(async () => {
        throw new Error("password authentication failed for user hunter2");
      }),
    };

    await expect(
      checkDatabase(database, { environment: "production" }),
    ).resolves.toBe("failed");

    expect(recordDatabaseOperation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failure" }),
    );
    expect(recordDatabaseConnectionFailure).toHaveBeenCalledWith({
      environment: "production",
      provider: "neon",
    });
  });

  it("fails after the timeout when the database never answers, without waiting for it", async () => {
    const database = {
      execute: vi.fn(() => new Promise<never>(() => undefined)),
    };
    const startedAt = Date.now();

    await expect(
      checkDatabase(database, { environment: "production", timeoutMs: 50 }),
    ).resolves.toBe("failed");

    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("does not leave an unhandled rejection when the abandoned query fails later", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let rejectLate!: (error: Error) => void;
      const database = {
        execute: () =>
          new Promise<never>((_resolve, reject) => {
            rejectLate = reject;
          }),
      };

      await checkDatabase(database, {
        environment: "production",
        timeoutMs: 20,
      });
      rejectLate(new Error("connection finally gave up"));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("treats a synchronous throw from the driver as a failure too", async () => {
    const database = {
      execute: () => {
        throw new Error("pool is closed");
      },
    };

    await expect(
      checkDatabase(database, { environment: "production" }),
    ).resolves.toBe("failed");
  });
});

describe("checkReadiness", () => {
  const ok = { execute: async () => [] };
  const down = {
    execute: async () => {
      throw new Error("down");
    },
  };

  it("is ready only when both checks pass", async () => {
    await expect(
      checkReadiness({
        database: ok,
        settings: FULL,
        environment: "production",
      }),
    ).resolves.toEqual({
      ready: true,
      checks: { configuration: "ok", database: "ok" },
    });
  });

  it("is not ready when the database is down", async () => {
    await expect(
      checkReadiness({
        database: down,
        settings: FULL,
        environment: "production",
      }),
    ).resolves.toEqual({
      ready: false,
      checks: { configuration: "ok", database: "failed" },
    });
  });

  it("is not ready when a critical setting is missing", async () => {
    await expect(
      checkReadiness({
        database: ok,
        settings: { ...FULL, CLERK_SECRET_KEY: "" },
        environment: "production",
      }),
    ).resolves.toEqual({
      ready: false,
      checks: { configuration: "failed", database: "ok" },
    });
  });
});
