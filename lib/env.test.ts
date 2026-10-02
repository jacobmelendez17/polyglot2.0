import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
