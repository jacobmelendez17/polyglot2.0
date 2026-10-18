import { describe, expect, it, vi } from "vitest";

// Liveness must not depend on the application's environment being valid: if
// this module ever imports `lib/env` (directly or through anything it imports),
// loading it throws and these tests fail.
vi.mock("@/lib/env", () => {
  throw new Error("liveness must not load the environment");
});
vi.mock("@/db/client", () => {
  throw new Error("liveness must not load the database");
});

import { GET } from "./route";

describe("GET /api/health", () => {
  it("answers 200 {status: ok} without loading the environment or the database", async () => {
    const response = GET(
      new Request("https://polyglot.example/api/health", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
