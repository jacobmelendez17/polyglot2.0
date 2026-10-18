import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { APP_ENV: "production" } }));

import {
  clearActiveSignals,
  setActiveSignals,
} from "@/lib/observability/active";
import { resetInstrumentsForTests } from "@/lib/observability/instruments";

import {
  markOperationCommitted,
  observeOperation,
} from "./operation-telemetry";
import { runInTraceContext } from "./trace-context";

class FakeDomainError extends Error {
  constructor(readonly code: string) {
    super(`refused: ${code}`);
    this.name = "ReviewError";
  }
}

let spanExporter: InMemorySpanExporter;
let metricExporter: InMemoryMetricExporter;
let tracerProvider: BasicTracerProvider;
let meterProvider: MeterProvider;

function start(signals: { traces: boolean; metrics: boolean }) {
  // Without a context manager an "active" span is not carried across awaits, so
  // nested spans would not nest; the real start-up registers the same one.
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  spanExporter = new InMemorySpanExporter();
  tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 3_600_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  resetInstrumentsForTests();
  setActiveSignals({ ...signals, logs: false });
}

afterEach(async () => {
  clearActiveSignals();
  trace.disable();
  metrics.disable();
  context.disable();
  resetInstrumentsForTests();
  await tracerProvider?.shutdown();
  await meterProvider?.shutdown();
});

async function exportedPoints(
  metricName: string,
): Promise<DataPoint<unknown>[]> {
  await meterProvider.forceFlush();
  const points: DataPoint<unknown>[] = [];
  for (const resource of metricExporter.getMetrics()) {
    for (const scope of resource.scopeMetrics) {
      for (const metric of scope.metrics) {
        if (metric.descriptor.name === metricName) {
          points.push(...metric.dataPoints);
        }
      }
    }
  }
  return points;
}

const ok = async () => "the result";

describe("with no telemetry signal running", () => {
  beforeEach(() => start({ traces: true, metrics: true }));

  it("does exactly what it always did: returns the result, creates no span, records nothing", async () => {
    clearActiveSignals();

    await expect(observeOperation("review.transaction", ok)).resolves.toBe(
      "the result",
    );

    expect(spanExporter.getFinishedSpans()).toEqual([]);
    expect(await exportedPoints("review_submission_total")).toEqual([]);
  });

  it("rethrows the very same error", async () => {
    clearActiveSignals();
    const failure = new Error("boom");

    await expect(
      observeOperation("review.transaction", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});

describe("an operation that is not on the list", () => {
  beforeEach(() => start({ traces: true, metrics: true }));

  it("is invisible to telemetry, however it is named", async () => {
    for (const name of [
      "admin.users.delete",
      "route.something",
      "constructor",
    ]) {
      await expect(observeOperation(name, ok)).resolves.toBe("the result");
    }

    expect(spanExporter.getFinishedSpans()).toEqual([]);
    expect(await exportedPoints("review_submission_total")).toEqual([]);
  });
});

describe("a listed operation", () => {
  beforeEach(() => start({ traces: true, metrics: true }));

  it("becomes a span named by the table, carrying the request id and the outcome", async () => {
    await runInTraceContext("reviews.submitAnswer", () =>
      observeOperation("reviews.submitAnswer", ok),
    );

    const [span] = spanExporter.getFinishedSpans();
    expect(span!.name).toBe("review.submission");
    expect(span!.attributes).toMatchObject({
      "polyglot.operation": "reviews.submitAnswer",
      "polyglot.outcome": "accepted",
      "polyglot.trace_id": expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(span!.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(span!.events).toEqual([]);
  });

  it("is an `accepted` submission when nothing was committed, and `succeeded` when new work was", async () => {
    await observeOperation("reviews.submitAnswer", ok);
    await observeOperation("reviews.submitAnswer", async () => {
      markOperationCommitted();
      return "committed";
    });

    const points = await exportedPoints("review_submission_total");
    const byOutcome = Object.fromEntries(
      points.map((point) => [
        (point.attributes as Record<string, string>).outcome,
        point.value,
      ]),
    );
    expect(byOutcome).toEqual({ accepted: 1, succeeded: 1 });
    expect(points[0]!.attributes).toMatchObject({
      environment: "production",
      error_category: "none",
    });
  });

  it("records how long a submission took, in the documented histogram", async () => {
    await observeOperation("reviews.submitAnswer", ok);

    const [point] = await exportedPoints("review_submission_duration_ms");
    expect(point!.attributes).toEqual({
      environment: "production",
      outcome: "accepted",
    });
    expect((point!.value as { count: number }).count).toBe(1);
  });

  it("calls a lesson completion that committed nothing a replay, not a second success", async () => {
    await observeOperation("lesson.transaction", async () => {
      markOperationCommitted();
    });
    await observeOperation("lesson.transaction", ok);

    const points = await exportedPoints("lesson_completion_total");
    const byOutcome = Object.fromEntries(
      points.map((point) => [
        (point.attributes as Record<string, string>).outcome,
        point.value,
      ]),
    );
    expect(byOutcome).toEqual({ succeeded: 1, replayed: 1 });
  });

  it("shares the commit flag with the operations nested inside, and nests their spans", async () => {
    await observeOperation("reviews.submitAnswer", () =>
      observeOperation("review.transaction", async () => {
        markOperationCommitted();
      }),
    );

    const spans = spanExporter.getFinishedSpans();
    const outer = spans.find((span) => span.name === "review.submission")!;
    const inner = spans.find((span) => span.name === "review.commit")!;
    expect(outer.attributes["polyglot.outcome"]).toBe("succeeded");
    expect(inner.attributes["polyglot.outcome"]).toBe("succeeded");
    expect(inner.parentSpanContext?.spanId).toBe(outer.spanContext().spanId);
    expect(inner.spanContext().traceId).toBe(outer.spanContext().traceId);
  });

  it("calls a business refusal `expected_rejected`, with its code, and is not an error span", async () => {
    const refusal = new FakeDomainError("STALE_REVIEW");

    await expect(
      observeOperation("reviews.submitAnswer", async () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);

    const [span] = spanExporter.getFinishedSpans();
    expect(span!.attributes).toMatchObject({
      "polyglot.outcome": "expected_rejected",
      "polyglot.error_category": "STALE_REVIEW",
    });
    expect(span!.status.code).not.toBe(SpanStatusCode.ERROR);

    const [point] = await exportedPoints("review_submission_total");
    expect(point!.attributes).toMatchObject({
      outcome: "expected_rejected",
      error_category: "STALE_REVIEW",
    });
  });

  it("calls anything else `unexpected_failed`, marks the span an error, and never exports the message", async () => {
    const SECRET = "postgres://user:hunter2@host/db";
    const failure = new Error(`connect failed: ${SECRET}`);

    await expect(
      observeOperation("reviews.submitAnswer", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const [span] = spanExporter.getFinishedSpans();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.status.message).toBeUndefined();
    expect(span!.attributes["polyglot.error_category"]).toBe("UNEXPECTED");
    expect(span!.events).toEqual([]);
    expect(JSON.stringify(span!.attributes)).not.toContain("hunter2");

    const [point] = await exportedPoints("review_submission_total");
    expect(point!.attributes).toMatchObject({
      outcome: "unexpected_failed",
      error_category: "UNEXPECTED",
    });
    expect(JSON.stringify(point!.attributes)).not.toContain("hunter2");
  });

  it("does not trust an error code that is not a plain constant as a label", async () => {
    await expect(
      observeOperation("reviews.submitAnswer", async () => {
        throw new FakeDomainError("user@example.com failed");
      }),
    ).rejects.toThrow();

    const [point] = await exportedPoints("review_submission_total");
    expect(point!.attributes).toMatchObject({ error_category: "OTHER" });
  });

  it("has a span but no metrics for an operation that feeds none", async () => {
    await observeOperation("account.delete.finalize", ok);

    expect(spanExporter.getFinishedSpans().map((span) => span.name)).toEqual([
      "account.deletion.finalize",
    ]);
  });
});

describe("one signal at a time", () => {
  it("records metrics but creates no span when only metrics are running", async () => {
    start({ traces: false, metrics: true });

    await observeOperation("reviews.submitAnswer", ok);

    expect(spanExporter.getFinishedSpans()).toEqual([]);
    expect(await exportedPoints("review_submission_total")).toHaveLength(1);
  });

  it("creates the span but records no metric when only traces are running", async () => {
    start({ traces: true, metrics: false });

    await observeOperation("reviews.submitAnswer", ok);

    expect(spanExporter.getFinishedSpans()).toHaveLength(1);
    expect(await exportedPoints("review_submission_total")).toEqual([]);
  });
});

describe("when telemetry itself misbehaves", () => {
  it("still runs the work, once, if the tracer fails before starting it", async () => {
    start({ traces: true, metrics: true });
    trace.disable();
    trace.setGlobalTracerProvider({
      getTracer: () => ({
        startSpan: () => {
          throw new Error("tracer is broken");
        },
        startActiveSpan: () => {
          throw new Error("tracer is broken");
        },
      }),
    });
    const work = vi.fn(async () => "the result");

    await expect(observeOperation("reviews.submitAnswer", work)).resolves.toBe(
      "the result",
    );

    expect(work).toHaveBeenCalledTimes(1);
  });

  it("does not swallow the work's own failure when the tracer is healthy", async () => {
    start({ traces: true, metrics: true });
    const failure = new Error("the work failed");
    const work = vi.fn(async () => {
      throw failure;
    });

    await expect(observeOperation("reviews.submitAnswer", work)).rejects.toBe(
      failure,
    );

    expect(work).toHaveBeenCalledTimes(1);
  });
});

describe("markOperationCommitted", () => {
  it("does nothing, and does not throw, outside an observed operation", () => {
    expect(() => markOperationCommitted()).not.toThrow();
  });
});
