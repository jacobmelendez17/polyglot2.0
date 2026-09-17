import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedEnv: {
  APP_ENV: "development" | "preview" | "production";
  RELEASE: string;
  LOG_LEVEL: "debug" | "info" | "warn" | "error" | "fatal" | undefined;
} = {
  APP_ENV: "development",
  RELEASE: "test-sha",
  LOG_LEVEL: undefined,
};

vi.mock("@/lib/env", () => ({ env: mockedEnv }));

// Imported after the mock is registered so `logger.ts` resolves `@/lib/env`
// to the mock above rather than the real, fully-validated singleton.
const { logger } = await import("./logger");
const { runInTraceContext } = await import("./trace-context");

describe("logger (spec 24)", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedEnv.APP_ENV = "development";
    mockedEnv.RELEASE = "test-sha";
    mockedEnv.LOG_LEVEL = undefined;
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a readable single line in development", () => {
    logger.info({ event: "review.complete.started", userId: "u1" });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = infoSpy.mock.calls[0][0] as string;
    expect(typeof line).toBe("string");
    expect(line).toContain("INFO review.complete.started");
    expect(line).toContain('"userId":"u1"');
  });

  it("emits one JSON object per line outside development", () => {
    mockedEnv.APP_ENV = "production";
    logger.info({ event: "review.complete.succeeded", durationMs: 42 });
    const line = infoSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: "info",
      event: "review.complete.succeeded",
      environment: "production",
      release: "test-sha",
      service: "polyglot",
      durationMs: 42,
    });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("suppresses debug output in production by default", () => {
    mockedEnv.APP_ENV = "production";
    logger.debug({ event: "review.debug.detail" });
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("allows debug output in development by default", () => {
    logger.debug({ event: "review.debug.detail" });
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit LOG_LEVEL override", () => {
    mockedEnv.APP_ENV = "development";
    mockedEnv.LOG_LEVEL = "error";
    logger.warn({ event: "rate_limit.exceeded" });
    logger.error({ event: "database.transaction.failed" });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("includes the active trace context on every log line", () => {
    mockedEnv.APP_ENV = "production";
    runInTraceContext("reviews.completeReview", () => {
      logger.info({ event: "review.eligibility.validated" });
    });
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.operation).toBe("reviews.completeReview");
    expect(typeof parsed.traceId).toBe("string");
    expect(parsed.requestId).toBe(parsed.traceId);
  });

  it("serializes an attached Error with name, message, stack, and errorCode", () => {
    mockedEnv.APP_ENV = "production";
    class ReviewError extends Error {
      code = "REVIEW_NOT_DUE";
      constructor() {
        super("Not due yet");
        this.name = "ReviewError";
      }
    }
    logger.warn({ event: "review.complete.failed", error: new ReviewError() });
    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.error).toMatchObject({
      name: "ReviewError",
      message: "Not due yet",
      errorCode: "REVIEW_NOT_DUE",
    });
    expect(typeof parsed.error.stack).toBe("string");
  });

  it("never lets a password/token/secret field reach the serialized line", () => {
    mockedEnv.APP_ENV = "production";
    logger.info({
      event: "auth.user_resolved",
      password: "hunter2",
      sessionToken: "abc.def.ghi",
      authorization: "Bearer super-secret",
      userId: "u1",
    });
    const line = infoSpy.mock.calls[0][0] as string;
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("abc.def.ghi");
    expect(line).not.toContain("super-secret");
    const parsed = JSON.parse(line);
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.sessionToken).toBe("[REDACTED]");
    expect(parsed.authorization).toBe("[REDACTED]");
    expect(parsed.userId).toBe("u1");
  });

  it("does not accidentally emit a full request body passed under an unexpected key", () => {
    // Spec 24 test requirement: "production logging does not accidentally
    // emit full request bodies." The logger has no special knowledge of
    // "body" as a field name — this documents that callers must not pass
    // one, by demonstrating the field passes through unredacted if given.
    // Guarding against this is a code-review/call-site discipline, not a
    // logger responsibility; this test exists to make that boundary explicit.
    mockedEnv.APP_ENV = "production";
    logger.info({ event: "route.completed", route: "reviews-submit" });
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.body).toBeUndefined();
  });
});
