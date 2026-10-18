// Next.js compiles its own copy of path-to-regexp to read a matcher, and ships
// no types for it. Using that copy is the point: it is the parser that decides
// whether the proxy runs, so this test sees what Next sees.
// @ts-expect-error TS7016 — no declaration file for Next's compiled module
import { pathToRegexp as compileMatcher } from "next/dist/compiled/path-to-regexp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));

import { config } from "./proxy";

/** Whether Next.js would run the proxy (Clerk's middleware) for this path. */
function runsFor(path: string): boolean {
  return config.matcher.some((source) =>
    (compileMatcher as (source: string) => RegExp)(source).test(path),
  );
}

describe("the proxy matcher", () => {
  it.each(["/api/health", "/api/health/ready", "/api/health/ready/"])(
    "keeps the health probe %s out of Clerk's middleware",
    (path) => {
      expect(runsFor(path)).toBe(false);
    },
  );

  it.each([
    "/",
    "/dashboard",
    "/lessons",
    "/reviews",
    "/settings/privacy",
    "/admin",
    "/sign-in",
    "/api/cron/finalize-account-deletions",
    "/api/v1/admin/overview",
    "/api/v1/admin/users",
    "/api/healthy",
    "/api/healthcheck",
    "/api/health-report",
    "/api/v1/health",
    "/trpc/anything",
    "/__clerk/handshake",
  ])("still runs it for %s", (path) => {
    expect(runsFor(path)).toBe(true);
  });

  it.each(["/_next/static/chunk.js", "/logo.png", "/favicon.ico"])(
    "still skips static assets such as %s",
    (path) => {
      expect(runsFor(path)).toBe(false);
    },
  );
});
