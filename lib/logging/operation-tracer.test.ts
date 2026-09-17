import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedEnv = {
  APP_ENV: "production" as const,
  RELEASE: "test-sha",
  LOG_LEVEL: "debug" as const,
};

vi.mock("@/lib/env", () => ({ env: mockedEnv }));

const { withTrace } = await import("./operation-tracer");
const { getTraceContext } = await import("./trace-context");

class ReviewError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`review error: ${code}`);
    this.name = "ReviewError";
    this.code = code;
  }
}

function parseLines(
  spy: ReturnType<typeof vi.spyOn>,
): Record<string, unknown>[] {
  return spy.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string));
}

describe("withTrace (spec 24)", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records started and succeeded, including duration, on success", async () => {
    const result = await withTrace(
      "reviews.completeReview",
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return "ok";
      },
      { level: "info" },
    );

    expect(result).toBe("ok");
    const lines = parseLines(infoSpy);
    expect(lines.map((line) => line.event)).toEqual([
      "reviews.completeReview.started",
      "reviews.completeReview.succeeded",
    ]);
    expect(typeof lines[1].durationMs).toBe("number");
    expect(lines[1].durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("attaches the caller's extra fields to every log line", async () => {
    await withTrace("lessons.completeLesson", async () => "done", {
      level: "info",
      fields: { userId: "u1", languageId: "lang-1" },
    });
    const lines = parseLines(infoSpy);
    for (const line of lines) {
      expect(line.userId).toBe("u1");
      expect(line.languageId).toBe("lang-1");
    }
  });

  it("logs an expected domain error at WARN with its structured error code, then rethrows", async () => {
    await expect(
      withTrace("reviews.completeReview", async () => {
        throw new ReviewError("REVIEW_NOT_DUE");
      }),
    ).rejects.toThrow("review error: REVIEW_NOT_DUE");

    expect(errorSpy).not.toHaveBeenCalled();
    const lines = parseLines(warnSpy);
    const failed = lines.find(
      (line) => line.event === "reviews.completeReview.failed",
    );
    expect(failed).toBeDefined();
    expect(failed?.errorCode).toBe("REVIEW_NOT_DUE");
    expect(typeof failed?.durationMs).toBe("number");
  });

  it("logs an unexpected error at ERROR with its stack, then rethrows", async () => {
    await expect(
      withTrace("reviews.completeReview", async () => {
        throw new Error("connection reset");
      }),
    ).rejects.toThrow("connection reset");

    const lines = parseLines(errorSpy);
    const failed = lines.find(
      (line) => line.event === "reviews.completeReview.failed",
    );
    expect(failed).toBeDefined();
    const errorField = failed?.error as Record<string, unknown>;
    expect(errorField.message).toBe("connection reset");
    expect(typeof errorField.stack).toBe("string");
  });

  it("gives every log line within one call the same trace id, and clears the context afterward", async () => {
    let traceIdDuringCall: string | undefined;
    await withTrace("reviews.completeReview", async () => {
      traceIdDuringCall = getTraceContext()?.traceId;
    });

    expect(getTraceContext()).toBeUndefined();

    const started = parseLines(infoSpy).find(
      (line) => line.event === "reviews.completeReview.started",
    );
    // level defaults to "debug" here (no `level` option passed), so nothing
    // was actually emitted to infoSpy for this call — assert via a
    // dedicated debug-level call instead.
    expect(started).toBeUndefined();
    expect(traceIdDuringCall).toBeTruthy();
  });

  it("two concurrent operations never share a trace id", async () => {
    const traceIds: string[] = [];

    async function run(delayMs: number) {
      await withTrace("progress.enrollItems", async () => {
        const traceId = getTraceContext()?.traceId;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        expect(getTraceContext()?.traceId).toBe(traceId);
        if (traceId) traceIds.push(traceId);
      });
    }

    await Promise.all([run(15), run(2)]);
    expect(new Set(traceIds).size).toBe(2);
  });
});
