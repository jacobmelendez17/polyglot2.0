import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationTemporality,
  DataPointType,
  InstrumentType,
  type MetricData,
  type PushMetricExporter,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import type { ReadableLogRecord } from "@opentelemetry/sdk-logs";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { describe, expect, it, vi } from "vitest";

import {
  GuardedLogExporter,
  GuardedMetricExporter,
  GuardedSpanExporter,
  sanitizeLogRecord,
  sanitizeMetrics,
} from "./exporters";

const SECRET = "hunter2-glc_AbCdEfGhIjKlMnOpQrStUv";

/** Collects what an inner exporter was asked to send. */
function recordingSpanExporter(
  behaviour: (cb: (r: ExportResult) => void) => void = (cb) =>
    cb({ code: ExportResultCode.SUCCESS }),
) {
  const sent: ReadableSpan[][] = [];
  const exporter: SpanExporter = {
    export: (spans, cb) => {
      sent.push(spans);
      behaviour(cb);
    },
    shutdown: vi.fn(async () => undefined),
    forceFlush: vi.fn(async () => undefined),
  };
  return { exporter, sent };
}

function spansFromProvider(
  attributesList: Record<string, string | number>[],
): ReadableSpan[] {
  const memory = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memory)],
  });
  for (const attributes of attributesList) {
    provider.getTracer("x").startSpan("s", { attributes }).end();
  }
  return memory.getFinishedSpans();
}

function exportAndWait(
  exporter: { export: (items: never, cb: (r: ExportResult) => void) => void },
  items: unknown,
): Promise<ExportResult[]> {
  return new Promise((resolve) => {
    const results: ExportResult[] = [];
    exporter.export(items as never, (result) => results.push(result));
    setImmediate(() => resolve(results));
  });
}

describe("GuardedSpanExporter", () => {
  it("sends only sanitized spans, and drops what is not one of the two exportable kinds", async () => {
    const { exporter, sent } = recordingSpanExporter();
    const guarded = new GuardedSpanExporter(exporter, vi.fn());

    const results = await exportAndWait(
      guarded,
      spansFromProvider([
        {
          "next.span_type": "BaseServer.handleRequest",
          "http.method": "GET",
          "next.route": "/dashboard",
          "http.target": `/dashboard?token=${SECRET}`,
        },
        {
          "next.span_type": "AppRender.fetch",
          "http.url": `https://x/?t=${SECRET}`,
        },
      ]),
    );

    expect(results).toEqual([{ code: ExportResultCode.SUCCESS }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.map((span) => span.name)).toEqual(["GET /dashboard"]);
    expect(
      JSON.stringify(sent[0]!.map((span) => span.attributes)),
    ).not.toContain(SECRET);
  });

  it("sends nothing, and reports success, when no span is exportable", async () => {
    const { exporter, sent } = recordingSpanExporter();
    const onFailure = vi.fn();
    const guarded = new GuardedSpanExporter(exporter, onFailure);

    const results = await exportAndWait(
      guarded,
      spansFromProvider([{ "next.span_type": "AppRender.fetch" }]),
    );

    expect(results).toEqual([{ code: ExportResultCode.SUCCESS }]);
    expect(sent).toEqual([]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("counts a failed export once and passes the failure on", async () => {
    const { exporter } = recordingSpanExporter((cb) =>
      cb({ code: ExportResultCode.FAILED, error: new Error(SECRET) }),
    );
    const onFailure = vi.fn();
    const guarded = new GuardedSpanExporter(exporter, onFailure);

    const results = await exportAndWait(
      guarded,
      spansFromProvider([{ "polyglot.operation": "reviews.submitAnswer" }]),
    );

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe(ExportResultCode.FAILED);
  });

  it("turns an exporter that throws into one counted failure", async () => {
    const guarded = new GuardedSpanExporter(
      {
        export: () => {
          throw new Error(SECRET);
        },
        shutdown: async () => undefined,
      },
      vi.fn(),
    );
    const onFailure = vi.fn();
    const watched = new GuardedSpanExporter(
      {
        export: () => {
          throw new Error(SECRET);
        },
        shutdown: async () => undefined,
      },
      onFailure,
    );

    const results = await exportAndWait(
      watched,
      spansFromProvider([{ "polyglot.operation": "reviews.submitAnswer" }]),
    );

    expect(results).toEqual([{ code: ExportResultCode.FAILED }]);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(guarded).toBeDefined();
  });

  it("reports one result even if the exporter calls back twice, and survives a failing counter", async () => {
    const { exporter } = recordingSpanExporter((cb) => {
      cb({ code: ExportResultCode.FAILED });
      cb({ code: ExportResultCode.FAILED });
    });
    const guarded = new GuardedSpanExporter(exporter, () => {
      throw new Error("counter failed");
    });

    const results = await exportAndWait(
      guarded,
      spansFromProvider([{ "polyglot.operation": "reviews.submitAnswer" }]),
    );

    expect(results).toHaveLength(1);
  });

  it("passes flush and shutdown through", async () => {
    const { exporter } = recordingSpanExporter();
    const guarded = new GuardedSpanExporter(exporter, vi.fn());

    await guarded.forceFlush();
    await guarded.shutdown();

    expect(exporter.forceFlush).toHaveBeenCalledTimes(1);
    expect(exporter.shutdown).toHaveBeenCalledTimes(1);
  });
});

function metric(
  name: string,
  attributes: Record<string, string>[],
): MetricData {
  return {
    descriptor: {
      name,
      description: "",
      unit: "1",
      type: InstrumentType.COUNTER,
      valueType: 1,
    },
    aggregationTemporality: 1,
    dataPointType: DataPointType.SUM,
    isMonotonic: true,
    dataPoints: attributes.map((attrs) => ({
      attributes: attrs,
      startTime: [0, 0],
      endTime: [1, 0],
      value: 1,
    })),
  } as unknown as MetricData;
}

function resourceMetrics(metrics: MetricData[]): ResourceMetrics {
  return {
    resource: resourceFromAttributes({ "service.name": "polyglot" }),
    scopeMetrics: [{ scope: { name: "polyglot" }, metrics }],
  };
}

describe("sanitizeMetrics", () => {
  it("keeps the catalog's metrics with their allowed labels", () => {
    const safe = sanitizeMetrics(
      resourceMetrics([
        metric("review_submission_total", [
          {
            environment: "production",
            outcome: "succeeded",
            error_category: "none",
          },
        ]),
      ]),
    );

    expect(safe.scopeMetrics[0]!.metrics[0]!.dataPoints).toHaveLength(1);
  });

  it("drops a metric that is not in the catalog", () => {
    const safe = sanitizeMetrics(
      resourceMetrics([
        metric("process_cpu_seconds_total", [{ pid: "123" }]),
        metric("lesson_completion_total", [
          { environment: "production", outcome: "succeeded" },
        ]),
      ]),
    );

    expect(
      safe.scopeMetrics[0]!.metrics.map((entry) => entry.descriptor.name),
    ).toEqual(["lesson_completion_total"]);
  });

  it("drops a data point carrying a label its instrument may not have, such as a user id", () => {
    const safe = sanitizeMetrics(
      resourceMetrics([
        metric("review_submission_total", [
          {
            environment: "production",
            outcome: "succeeded",
            error_category: "none",
          },
          {
            environment: "production",
            outcome: "succeeded",
            error_category: "none",
            user_id: "u-1",
          },
        ]),
      ]),
    );

    const points = safe.scopeMetrics[0]!.metrics[0]!.dataPoints;
    expect(points).toHaveLength(1);
    expect(JSON.stringify(points)).not.toContain("u-1");
  });

  it("leaves nothing to export when nothing is left", () => {
    const safe = sanitizeMetrics(
      resourceMetrics([
        metric("review_submission_total", [{ user_id: "u-1" }]),
      ]),
    );

    expect(safe.scopeMetrics).toEqual([]);
  });
});

describe("GuardedMetricExporter", () => {
  function inner(): PushMetricExporter & { sent: ResourceMetrics[] } {
    const sent: ResourceMetrics[] = [];
    return {
      sent,
      export: (metrics, cb) => {
        sent.push(metrics);
        cb({ code: ExportResultCode.SUCCESS });
      },
      forceFlush: async () => undefined,
      shutdown: async () => undefined,
      selectAggregationTemporality: () => AggregationTemporality.DELTA,
      selectAggregation: () => ({ type: 0 }) as never,
    };
  }

  it("sends only the sanitized catalog, and nothing when there is nothing", async () => {
    const wrapped = inner();
    const guarded = new GuardedMetricExporter(wrapped, vi.fn());

    await exportAndWait(
      guarded,
      resourceMetrics([
        metric("review_submission_total", [{ user_id: "u-1" }]),
      ]),
    );
    expect(wrapped.sent).toEqual([]);

    await exportAndWait(
      guarded,
      resourceMetrics([
        metric("lesson_completion_total", [
          { environment: "production", outcome: "succeeded" },
        ]),
      ]),
    );
    expect(wrapped.sent).toHaveLength(1);
  });

  it("counts a failure, and defers temporality to the exporter it wraps", async () => {
    const wrapped = inner();
    wrapped.export = (_metrics, cb) => cb({ code: ExportResultCode.FAILED });
    const onFailure = vi.fn();
    const guarded = new GuardedMetricExporter(wrapped, onFailure);

    await exportAndWait(
      guarded,
      resourceMetrics([
        metric("lesson_completion_total", [
          { environment: "production", outcome: "succeeded" },
        ]),
      ]),
    );

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(guarded.selectAggregationTemporality(InstrumentType.COUNTER)).toBe(
      AggregationTemporality.DELTA,
    );
  });
});

function logRecord(
  overrides: Partial<ReadableLogRecord> = {},
): ReadableLogRecord {
  return {
    hrTime: [1, 0],
    hrTimeObserved: [1, 0],
    severityText: "ERROR",
    severityNumber: 17,
    body: "review.transaction.failed",
    resource: resourceFromAttributes({ "service.name": "polyglot" }),
    instrumentationScope: { name: "some.library", version: "1.2.3" },
    attributes: {},
    droppedAttributesCount: 0,
    ...overrides,
  };
}

describe("sanitizeLogRecord", () => {
  it("rebuilds a record from the allowlist, whatever it arrived with", () => {
    const safe = sanitizeLogRecord(
      logRecord({
        body: `failed for someone@example.com ${SECRET}`,
        severityText: SECRET,
        severityNumber: 999 as never,
        eventName: "x",
        attributes: {
          "event.name": "review.transaction.failed",
          "user.email": "someone@example.com",
          message: SECRET,
          "polyglot.status": 500,
        },
      }),
    );

    expect(safe.body).toBe("log");
    expect(safe.severityText).toBeUndefined();
    expect(safe.severityNumber).toBeUndefined();
    expect(safe.eventName).toBeUndefined();
    expect(safe.attributes).toEqual({
      "event.name": "review.transaction.failed",
      "polyglot.status": 500,
    });
    expect(safe.instrumentationScope).toEqual({ name: "polyglot" });
    expect(JSON.stringify(safe.attributes) + safe.body).not.toContain(SECRET);
  });

  it("keeps the ids that tie a record to its span, and nothing else of the span context", () => {
    const safe = sanitizeLogRecord(
      logRecord({
        spanContext: {
          traceId: "0af7651916cd43dd8448eb211c80319c",
          spanId: "b7ad6b7169203331",
          traceFlags: 1,
          traceState: { serialize: () => "vendor=secret" } as never,
        },
      }),
    );

    expect(safe.spanContext).toEqual({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
    });
  });
});

describe("GuardedLogExporter", () => {
  it("sends sanitized records, reports success for an empty batch, and counts a failure", async () => {
    const sent: ReadableLogRecord[][] = [];
    const onFailure = vi.fn();
    let outcome = ExportResultCode.SUCCESS;
    const guarded = new GuardedLogExporter(
      {
        export: (records, cb) => {
          sent.push(records);
          cb({ code: outcome });
        },
        forceFlush: async () => undefined,
        shutdown: async () => undefined,
      },
      onFailure,
    );

    expect(await exportAndWait(guarded, [])).toEqual([
      { code: ExportResultCode.SUCCESS },
    ]);
    expect(sent).toEqual([]);

    await exportAndWait(guarded, [
      logRecord({ attributes: { message: SECRET, "polyglot.status": 500 } }),
    ]);
    expect(sent[0]![0]!.attributes).toEqual({ "polyglot.status": 500 });

    outcome = ExportResultCode.FAILED;
    await exportAndWait(guarded, [logRecord()]);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
