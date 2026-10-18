import { expect, test } from "@playwright/test";

/**
 * Spec 27 Unit 27.7 — the public health endpoints, against the real E2E server
 * and its isolated database, signed out: they are what an external monitor sees.
 *
 * No test here injects an outage. Readiness against a dead database is proved
 * where it can be done without risk — the handler tests with a database that
 * errors, hangs and fails late — and never against a shared one.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("liveness: GET /api/health", () => {
  test("answers 200 with only a status, uncached, with no cookie", async ({
    request,
  }) => {
    const response = await request.get("/api/health", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("is not behind sign-in, and not answered with Clerk's handshake even for a request that asks for HTML", async ({
    request,
  }) => {
    const response = await request.get("/api/health", {
      maxRedirects: 0,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("answers a HEAD request and refuses a write", async ({ request }) => {
    const head = await request.head("/api/health", { maxRedirects: 0 });
    expect(head.status()).toBe(200);

    const post = await request.post("/api/health", { maxRedirects: 0 });
    expect(post.status()).toBe(405);
  });
});

test.describe("readiness: GET /api/health/ready", () => {
  test("is 200 and ready against the E2E database, uncached, saying only that it is ready", async ({
    request,
  }) => {
    const response = await request.get("/api/health/ready", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(await response.json()).toEqual({ status: "ready" });
  });

  test("is not behind sign-in either", async ({ request }) => {
    const response = await request.get("/api/health/ready", {
      maxRedirects: 0,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });

    expect(response.status()).toBe(200);
  });

  test("tells a monitor nothing about the build, the host or the stack", async ({
    request,
  }) => {
    for (const path of ["/api/health", "/api/health/ready"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      const text = await response.text();

      expect(text).not.toMatch(
        /postgres|neon|clerk|release|version|sha|host|stack/i,
      );
      expect(response.headers()["x-powered-by"]).toBeUndefined();
    }
  });
});
