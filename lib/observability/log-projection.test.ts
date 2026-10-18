import { describe, expect, it } from "vitest";

import {
  LOG_ATTRIBUTES,
  LOG_EXPORT_MIN_LEVEL,
  projectLogRecord,
  sanitizeLogAttributes,
  sanitizeLogBody,
  SEVERITY_NUMBERS,
} from "./log-projection";

const REQUEST_ID = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const VERCEL_ID = "iad1::sfo1::abcde-1710000000000-0123456789ab";

/** Things that must never be exportable, however a line is built. */
const SENSITIVE = [
  "hunter2",
  "someone@example.com",
  "SELECT * FROM users",
  "my private journal entry",
  "Bearer abc.def.ghi",
  "postgres://user:pw@host/db",
  "glc_AbCdEfGhIjKlMnOpQrStUv",
  "/Users/crisp_potato/Developer",
  "11111111-2222-3333-4444-555555555555", // a user id
  "item-4242",
];

/** A line as the logger builds it, with every kind of thing that should not escape. */
function hostileLine(): Record<string, unknown> {
  return {
    timestamp: "2026-10-18T10:00:00.000Z",
    level: "error",
    environment: "production",
    release: "abc123",
    service: "polyglot",
    traceId: REQUEST_ID,
    requestId: REQUEST_ID,
    operation: "reviews.submitAnswer",
    event: "review.transaction.failed",
    durationMs: 12.34567,
    status: 500,
    method: "POST",
    errorCode: "STALE_REVIEW",
    // Everything below has no attribute to go in.
    userId: "11111111-2222-3333-4444-555555555555",
    itemId: "item-4242",
    email: "someone@example.com",
    message: "failed for someone@example.com with hunter2",
    answer: "hunter2",
    journal: "my private journal entry",
    sql: "SELECT * FROM users WHERE email = 'someone@example.com'",
    url: "https://example.com/reviews?token=glc_AbCdEfGhIjKlMnOpQrStUv",
    authorization: "Bearer abc.def.ghi",
    cookie: "[REDACTED]",
    databaseUrl: "postgres://user:pw@host/db",
    headers: { "x-forwarded-for": "203.0.113.9", cookie: "session=hunter2" },
    nested: { deep: { email: "someone@example.com" } },
    list: ["hunter2", { email: "someone@example.com" }],
    error: {
      name: "NeonDbError",
      message: "password authentication failed for user hunter2",
      stack: "Error: boom\n    at /Users/crisp_potato/Developer/app.ts:1:1",
      errorCode: "08006",
      cause: { message: "postgres://user:pw@host/db" },
    },
  };
}

describe("projectLogRecord", () => {
  it("keeps the few fields on the allowlist and nothing else", () => {
    const record = projectLogRecord("error", hostileLine())!;

    expect(record).toEqual({
      severityNumber: SEVERITY_NUMBERS.error,
      severityText: "ERROR",
      body: "review.transaction.failed",
      attributes: {
        "event.name": "review.transaction.failed",
        "polyglot.operation": "reviews.submitAnswer",
        "http.request.method": "POST",
        "polyglot.status": 500,
        "polyglot.error_code": "STALE_REVIEW",
        "exception.type": "NeonDbError",
        "polyglot.duration_ms": 12.346,
        "polyglot.trace_id": REQUEST_ID,
        "polyglot.request_id": REQUEST_ID,
      },
    });
  });

  it("leaves none of the sensitive content anywhere in what would be exported", () => {
    const serialized = JSON.stringify(projectLogRecord("error", hostileLine()));

    for (const secret of SENSITIVE) {
      expect(serialized, `"${secret}" must not be exported`).not.toContain(
        secret,
      );
    }
  });

  it("does not modify the line it was given", () => {
    const line = hostileLine();
    const before = JSON.stringify(line);

    projectLogRecord("error", line);

    expect(JSON.stringify(line)).toBe(before);
  });

  it("exports warnings and worse, and nothing below", () => {
    expect(LOG_EXPORT_MIN_LEVEL).toBe("warn");
    expect(projectLogRecord("debug", hostileLine())).toBeNull();
    expect(projectLogRecord("info", hostileLine())).toBeNull();
    expect(projectLogRecord("warn", hostileLine())?.severityNumber).toBe(13);
    expect(projectLogRecord("error", hostileLine())?.severityNumber).toBe(17);
    expect(projectLogRecord("fatal", hostileLine())?.severityNumber).toBe(21);
  });

  it("takes a domain error's code from the line, or from the serialised error", () => {
    expect(
      projectLogRecord("warn", {
        event: "x.failed",
        error: { errorCode: "REVIEW_NOT_DUE" },
      })?.attributes["polyglot.error_code"],
    ).toBe("REVIEW_NOT_DUE");
    expect(
      projectLogRecord("warn", {
        event: "x.failed",
        errorCode: "STALE_REVIEW",
        error: { errorCode: "REVIEW_NOT_DUE" },
      })?.attributes["polyglot.error_code"],
    ).toBe("STALE_REVIEW");
  });

  it("does not read inherited properties", () => {
    const inherited = Object.create({
      event: "inherited.event",
      operation: "inherited.operation",
    }) as Record<string, unknown>;

    const record = projectLogRecord("error", inherited)!;

    expect(record.body).toBe("log");
    expect(record.attributes).toEqual({});
  });

  it("copes with a line that is mostly junk", () => {
    expect(() =>
      projectLogRecord("error", {
        event: 7,
        error: "just a string",
        operation: {},
      }),
    ).not.toThrow();
    expect(
      projectLogRecord(
        "error",
        JSON.parse('{"__proto__":{"event":"x"},"event":"a.b"}'),
      ),
    ).toMatchObject({ body: "a.b" });
  });
});

describe("the event name, which becomes the record's body", () => {
  it.each([
    "review.transaction.failed",
    "analytics.posthog.send_failed",
    "telemetry.config.blocked",
    "idempotency.in_progress",
  ])("accepts the constant %s", (event) => {
    expect(sanitizeLogBody(event)).toBe(event);
  });

  it.each([
    "failed for someone@example.com",
    "Review.Failed",
    "has a space",
    "trailing.",
    ".leading",
    "a..b",
    "line\nbreak",
    "x".repeat(101),
    "",
    7,
    null,
    { event: "a.b" },
  ])("replaces %j with a fixed word, never a message", (event) => {
    expect(sanitizeLogBody(event)).toBe("log");
    expect(
      projectLogRecord("error", { event })?.attributes["event.name"],
    ).toBeUndefined();
  });
});

describe("each attribute accepts only values of its own shape", () => {
  const bad: Record<string, unknown[]> = {
    "event.name": ["Has Spaces", "a@b.c"],
    "polyglot.operation": ["has space", "a@b.c", "", "x".repeat(81), 7],
    "polyglot.route": ["/items/42?token=1", "has space"],
    "http.request.method": ["PROPFIND", "get /x", 7],
    "polyglot.status": [99, 600, 200.5, "200", NaN],
    "polyglot.outcome": ["it worked", "SUCCEEDED", 1],
    "polyglot.result": ["Advanced!", "x".repeat(31)],
    "polyglot.reason": ["user said no", "Reason"],
    "polyglot.error_code": ["error 12", "lowercase", "A", "x@y.z"],
    "exception.type": ["Error: boom", "has space", "x".repeat(61)],
    "polyglot.duration_ms": [-1, NaN, Infinity, 86_400_001, "12"],
    "polyglot.provider": ["Has Space", "x".repeat(31)],
    "polyglot.signal": ["a b"],
    "polyglot.dropped": [-1, 1.5, 1_000_001],
    "polyglot.trace_id": ["not-a-uuid", "5d1c4a4e2f5b4a409a390f6f9f3b8c11"],
    "polyglot.request_id": [
      "AKIAIOSFODNN7EXAMPLE",
      "<script>alert(1)</script>",
      "x".repeat(100),
      "hunter2",
    ],
  };

  it("has a rejection case for every attribute it allows", () => {
    expect(Object.keys(bad).sort()).toEqual(Object.keys(LOG_ATTRIBUTES).sort());
  });

  for (const [attribute, values] of Object.entries(bad)) {
    it.each(values)(`drops ${attribute} = %j`, (value) => {
      expect(LOG_ATTRIBUTES[attribute]!(value)).toBeUndefined();
    });
  }

  it("accepts a request id that is a UUID or one of Vercel's", () => {
    expect(LOG_ATTRIBUTES["polyglot.request_id"]!(REQUEST_ID)).toBe(REQUEST_ID);
    expect(LOG_ATTRIBUTES["polyglot.request_id"]!(VERCEL_ID)).toBe(VERCEL_ID);
  });

  it("rounds a duration to three decimals", () => {
    expect(LOG_ATTRIBUTES["polyglot.duration_ms"]!(1.23456)).toBe(1.235);
  });
});

describe("sanitizeLogAttributes", () => {
  it("re-applies the allowlist to a record that arrives some other way", () => {
    const sanitized = sanitizeLogAttributes({
      "event.name": "route.failed",
      "polyglot.status": 500,
      "user.id": "11111111-2222-3333-4444-555555555555",
      message: "failed for someone@example.com",
      "polyglot.reason": "hunter2 was wrong",
      "polyglot.error_code": "STALE_REVIEW",
    });

    expect(sanitized).toEqual({
      "event.name": "route.failed",
      "polyglot.status": 500,
      "polyglot.error_code": "STALE_REVIEW",
    });
  });
});
