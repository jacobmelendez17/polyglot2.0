import { describe, expect, it } from "vitest";

import { isSensitiveKey, redact } from "./redact";

describe("redact (spec 24)", () => {
  it("passes primitives through unchanged", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
  });

  it("leaves Date instances untouched rather than flattening them into {}", () => {
    const date = new Date("2026-09-16T00:00:00.000Z");
    expect(redact(date)).toBe(date);
  });

  it.each([
    "password",
    "token",
    "accessToken",
    "secret",
    "clientSecret",
    "authorization",
    "authorizationHeader",
    "cookie",
    "sessionToken",
    "sessionCookie",
    "apiKey",
    "api_key",
    "databaseUrl",
    "database_url",
    "connectionString",
  ])("redacts a top-level field named %s", (key) => {
    const result = redact({ [key]: "sk_live_super_secret_value" }) as Record<
      string,
      unknown
    >;
    expect(result[key]).toBe("[REDACTED]");
  });

  it("does not redact ordinary safe fields", () => {
    const result = redact({
      userId: "u1",
      itemId: "item-1",
      durationMs: 42,
    }) as Record<string, unknown>;
    expect(result).toEqual({ userId: "u1", itemId: "item-1", durationMs: 42 });
  });

  it("does not redact reviewSessionId/lessonSessionId — spec-approved safe identifiers, not credentials", () => {
    const result = redact({
      reviewSessionId: "session-abc",
      lessonSessionId: "session-def",
    }) as Record<string, unknown>;
    expect(result).toEqual({
      reviewSessionId: "session-abc",
      lessonSessionId: "session-def",
    });
  });

  it("redacts nested sensitive fields at any depth", () => {
    const result = redact({
      event: "auth.user_resolved",
      request: { headers: { authorization: "Bearer abc123" } },
    }) as Record<string, unknown>;
    expect(
      (
        (result.request as Record<string, unknown>).headers as Record<
          string,
          unknown
        >
      ).authorization,
    ).toBe("[REDACTED]");
  });

  it("redacts sensitive fields inside arrays", () => {
    const result = redact({
      sessions: [{ token: "t1" }, { token: "t2" }],
    }) as { sessions: Array<Record<string, unknown>> };
    expect(result.sessions[0].token).toBe("[REDACTED]");
    expect(result.sessions[1].token).toBe("[REDACTED]");
  });

  it("does not throw on a circular reference", () => {
    const value: Record<string, unknown> = { name: "self-referential" };
    value.self = value;
    expect(() => redact(value)).not.toThrow();
    const result = redact(value) as Record<string, unknown>;
    expect(result.self).toBe("[CIRCULAR]");
  });

  it("isSensitiveKey matches case-insensitively", () => {
    expect(isSensitiveKey("PASSWORD")).toBe(true);
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("userId")).toBe(false);
  });
});
