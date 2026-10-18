import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: { execute } }));
vi.mock("@/lib/env", () => ({
  env: {
    APP_ENV: "development",
    DATABASE_URL: "postgres://x",
    CLERK_SECRET_KEY: "sk",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk",
    LESSON_STATE_SECRET: "s".repeat(32),
    REVIEW_STATE_SECRET: "r".repeat(32),
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logger: { warn } }));
vi.mock("@/providers/rate-limit", () => ({
  getRateLimiter: () => ({ check }),
}));

import { GET } from "./route";

const request = () =>
  new Request("https://polyglot.example/api/health/ready", {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

beforeEach(() => {
  execute.mockReset();
  check.mockReset();
  warn.mockReset();
  check.mockResolvedValue({ allowed: true });
});

describe("GET /api/health/ready", () => {
  it("is 200 when the database answers", async () => {
    execute.mockResolvedValue([]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("is 503, uncached, when the database is down", async () => {
    execute.mockRejectedValue(new Error("down"));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(warn).toHaveBeenCalledWith({
      event: "health.ready.failed",
      reason: "database_unreachable",
    });
  });
});
