import { describe, expect, it } from "vitest";

import {
  getTraceContext,
  generateTraceId,
  runInTraceContext,
} from "./trace-context";

describe("trace-context (spec 24)", () => {
  it("has no active context outside any traced operation", () => {
    expect(getTraceContext()).toBeUndefined();
  });

  it("generates a real UUID-shaped trace id", () => {
    const id = generateTraceId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("starts a fresh trace at the outermost call", () => {
    let observed: ReturnType<typeof getTraceContext>;
    runInTraceContext("reviews.completeReview", () => {
      observed = getTraceContext();
    });
    expect(observed?.operation).toBe("reviews.completeReview");
    expect(observed?.traceId).toBeTruthy();
    expect(observed?.requestId).toBe(observed?.traceId);
  });

  it("keeps the same trace id across nested operations, updating only operation", () => {
    let outerTraceId: string | undefined;
    let innerTraceId: string | undefined;
    let innerOperation: string | undefined;

    runInTraceContext("lessons.completeLesson", () => {
      outerTraceId = getTraceContext()?.traceId;
      runInTraceContext("progress.enrollItems", () => {
        innerTraceId = getTraceContext()?.traceId;
        innerOperation = getTraceContext()?.operation;
      });
      // The outer context is restored once the nested call returns.
      expect(getTraceContext()?.operation).toBe("lessons.completeLesson");
    });

    expect(innerTraceId).toBe(outerTraceId);
    expect(innerOperation).toBe("progress.enrollItems");
  });

  it("forces a brand-new trace/request pair when newTrace is set, even inside an existing context", () => {
    let outerTraceId: string | undefined;
    let innerTraceId: string | undefined;

    runInTraceContext("route.reviewsSubmit", () => {
      outerTraceId = getTraceContext()?.traceId;
      runInTraceContext(
        "route.nestedRequest",
        () => {
          innerTraceId = getTraceContext()?.traceId;
        },
        { newTrace: true },
      );
    });

    expect(innerTraceId).not.toBe(outerTraceId);
  });

  it("uses a supplied requestId instead of generating one, only for a new trace", () => {
    let observed: ReturnType<typeof getTraceContext>;
    runInTraceContext(
      "route.finalizeAccountDeletions",
      () => {
        observed = getTraceContext();
      },
      { requestId: "inbound-request-123" },
    );
    expect(observed?.requestId).toBe("inbound-request-123");
  });

  it("does not leak trace context between two concurrent operations", async () => {
    const seenTraceIds: string[] = [];

    async function runTraced(operation: string, delayMs: number) {
      return runInTraceContext(operation, async () => {
        const traceId = getTraceContext()?.traceId;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // If context leaked between concurrent calls, this would now see
        // the *other* call's context instead of its own.
        expect(getTraceContext()?.traceId).toBe(traceId);
        expect(getTraceContext()?.operation).toBe(operation);
        if (traceId) seenTraceIds.push(traceId);
      });
    }

    await Promise.all([
      runTraced("review.complete", 20),
      runTraced("lesson.complete", 5),
    ]);

    expect(new Set(seenTraceIds).size).toBe(2);
  });
});
