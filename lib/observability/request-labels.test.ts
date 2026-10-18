import { describe, expect, it } from "vitest";

import {
  isHealthRoute,
  normalizeMethod,
  normalizeRoute,
  requestOperation,
  statusClass,
  UNMATCHED_ROUTE,
} from "./request-labels";

describe("normalizeMethod", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
    "keeps %s",
    (method) => {
      expect(normalizeMethod(method)).toBe(method);
    },
  );

  it("upper-cases a method", () => {
    expect(normalizeMethod("get")).toBe("GET");
  });

  it.each(["PROPFIND", "TRACE", "", "GET /x", "GET\n", 7, null, undefined])(
    "reports %j as OTHER rather than minting a new label",
    (method) => {
      expect(normalizeMethod(method)).toBe("OTHER");
    },
  );
});

describe("statusClass", () => {
  it.each([
    [101, "1xx"],
    [200, "2xx"],
    [204, "2xx"],
    [307, "3xx"],
    [404, "4xx"],
    [429, "4xx"],
    [500, "5xx"],
    [599, "5xx"],
  ])("maps %i to %s", (status, expected) => {
    expect(statusClass(status)).toBe(expected);
  });

  it.each([99, 600, 0, -1, 200.5, NaN, "200", null, undefined])(
    "maps %j to unknown",
    (status) => {
      expect(statusClass(status)).toBe("unknown");
    },
  );
});

describe("normalizeRoute", () => {
  it.each([
    ["/", "/"],
    ["/dashboard", "/dashboard"],
    ["/settings/privacy", "/settings/privacy"],
    ["/items/[id]", "/items/:param"],
    ["/docs/[...slug]", "/docs/:param"],
    ["/docs/[[...slug]]", "/docs/:param"],
    ["/_not-found", "/_not-found"],
  ])("keeps the template %s as %s", (route, expected) => {
    expect(normalizeRoute(route)).toBe(expected);
  });

  it("cuts a deep route to its first three segments, so deep detail cannot multiply series", () => {
    expect(normalizeRoute("/api/v1/admin/levels/[levelId]/publish")).toBe(
      "/api/v1/admin",
    );
    expect(normalizeRoute("/a/b/c/d/e")).toBe("/a/b/c");
  });

  it.each([
    "/dashboard?token=abc123",
    "/items/42?x=1",
    "/lessons#frag",
    "/items/some%20thing",
    "/items/a b",
    "/path\nwith-newline",
    "/\u0000",
    "dashboard",
    "",
    "https://example.com/dashboard",
    "/x".repeat(200),
  ])("refuses %j, which is not a route template", (route) => {
    expect(normalizeRoute(route)).toBe(UNMATCHED_ROUTE);
  });

  it.each([null, undefined, 42, {}, []])(
    "refuses a non-string (%j)",
    (route) => {
      expect(normalizeRoute(route)).toBe(UNMATCHED_ROUTE);
    },
  );

  it("never lets a secret-looking path become a label", () => {
    const label = normalizeRoute("/reset/glc_AbCdEfGhIjKlMnOpQrStUv?x=1");
    expect(label).toBe(UNMATCHED_ROUTE);
  });
});

describe("isHealthRoute", () => {
  it("recognises the two probes and nothing else", () => {
    expect(isHealthRoute("/api/health")).toBe(true);
    expect(isHealthRoute("/api/health/ready")).toBe(true);
    expect(isHealthRoute("/api/healthy")).toBe(false);
    expect(isHealthRoute("/health")).toBe(false);
    expect(isHealthRoute("/api/v1/admin")).toBe(false);
  });
});

describe("requestOperation", () => {
  it("separates API handlers, page renders and server actions", () => {
    expect(requestOperation("GET", "/api/v1/admin")).toBe("api");
    expect(
      requestOperation("POST", "/api/cron/finalize-account-deletions"),
    ).toBe("api");
    expect(requestOperation("GET", "/dashboard")).toBe("page");
    expect(requestOperation("HEAD", "/dashboard")).toBe("page");
    expect(requestOperation("POST", "/reviews")).toBe("action");
    expect(requestOperation("OPTIONS", "/reviews")).toBe("other");
    expect(requestOperation("OTHER", "/reviews")).toBe("other");
  });
});
