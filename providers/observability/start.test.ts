import {
  AggregationTemporality,
  InMemoryMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { APP_ENV: "production", RELEASE: "abc123", LOG_LEVEL: "debug" },
}));

import { resetInstrumentsForTests } from "@/lib/observability/instruments";
import { getActiveSignals } from "@/lib/observability/active";
import { SecretValue, type TelemetryConfig } from "@/lib/telemetry-config";

import {
  GuardedLogExporter,
  GuardedMetricExporter,
  GuardedSpanExporter,
} from "./exporters";
import {
  NEVER_EXPORTED,
  simulateHostileRequest,
} from "@/providers/test-support/simulate-request";
import { startObservability, type ObservabilityHandle } from "./start";

const SECRET = "hunter2-glc_AbCdEfGhIjKlMnOpQrStUv";
const connection = {
  endpoint: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
  instanceId: "123456",
  token: new SecretValue(`glc_${"a".repeat(30)}`),
};

type Observability = TelemetryConfig["observability"];
const off: Observability = {
  metrics: { state: "disabled" },
  traces: { state: "disabled" },
  logs: { state: "disabled" },
};
const enabled = (overrides: Partial<Observability> = {}): Observability => ({
  metrics: { state: "enabled", connection },
  traces: { state: "enabled", connection, sampleRatio: 1 },
  logs: { state: "enabled", connection },
  ...overrides,
});

let handle: ObservabilityHandle | null = null;

function inMemory() {
  const spans = new InMemorySpanExporter();
  const metricData = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const logRecords = new InMemoryLogRecordExporter();
  return {
    spans,
    metricData,
    logRecords,
    seam: {
      // Behind the real guards, as in production.
      traces: vi.fn(
        (_target, onFailure) => new GuardedSpanExporter(spans, onFailure),
      ),
      metrics: vi.fn(
        (_target, onFailure) =>
          new GuardedMetricExporter(metricData, onFailure),
      ),
      logs: vi.fn(
        (_target, onFailure) => new GuardedLogExporter(logRecords, onFailure),
      ),
    },
  };
}

function start(config: Observability, seam = inMemory().seam, warn = vi.fn()) {
  handle = startObservability(config, {
    environment: "production",
    release: "abc123",
    exporters: seam,
    warn,
  });
  return handle;
}

afterEach(async () => {
  await handle?.shutdown();
  handle = null;
  resetInstrumentsForTests();
  vi.restoreAllMocks();
});

describe("with nothing enabled", () => {
  it("starts nothing, registers nothing and warns about nothing", () => {
    const { seam } = inMemory();
    const warn = vi.fn();

    expect(start(off, seam, warn)).toBeNull();

    expect(seam.traces).not.toHaveBeenCalled();
    expect(seam.metrics).not.toHaveBeenCalled();
    expect(seam.logs).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(getActiveSignals()).toEqual({
      metrics: false,
      traces: false,
      logs: false,
    });
  });

  it("reports a blocked signal by name, never by value, and still starts nothing", () => {
    const { seam } = inMemory();
    const warn = vi.fn();

    const blocked = {
      state: "blocked" as const,
      issues: [
        {
          code: "plan_not_confirmed" as const,
          setting: "GRAFANA_FREE_PLAN_CONFIRMED",
        },
      ],
    };
    expect(
      start(
        { metrics: blocked, traces: { state: "disabled" }, logs: blocked },
        seam,
        warn,
      ),
    ).toBeNull();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith({
      event: "telemetry.config.blocked",
      provider: "grafana",
      signal: "metrics",
      issues: blocked.issues,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("glc_");
    expect(seam.metrics).not.toHaveBeenCalled();
  });
});

describe("with some signals enabled", () => {
  it("builds the exporter for each enabled signal and no other", () => {
    const { seam } = inMemory();

    const started = start(
      enabled({ traces: { state: "disabled" }, logs: { state: "disabled" } }),
      seam,
    );

    expect(started?.signals).toEqual({
      metrics: true,
      traces: false,
      logs: false,
    });
    expect(seam.metrics).toHaveBeenCalledTimes(1);
    expect(seam.traces).not.toHaveBeenCalled();
    expect(seam.logs).not.toHaveBeenCalled();
    expect(getActiveSignals()).toEqual({
      metrics: true,
      traces: false,
      logs: false,
    });
  });

  it("hands each exporter the connection it was configured with", () => {
    const { seam } = inMemory();

    start(enabled(), seam);

    for (const factory of [seam.traces, seam.metrics, seam.logs]) {
      expect(factory.mock.calls[0]![0]).toMatchObject({
        endpoint: connection.endpoint,
        instanceId: "123456",
      });
    }
  });

  it("is idempotent: a second call changes nothing and builds nothing", () => {
    const { seam } = inMemory();
    const first = start(enabled(), seam);

    const second = startObservability(enabled(), {
      environment: "production",
      release: "abc123",
      exporters: seam,
    });

    expect(second).toBe(first);
    expect(seam.traces).toHaveBeenCalledTimes(1);
  });

  it("never throws, and leaves nothing registered, when an exporter cannot be built", () => {
    const { seam } = inMemory();
    seam.logs.mockImplementation(() => {
      throw new Error(`could not build ${SECRET}`);
    });

    expect(() => start(enabled(), seam)).not.toThrow();

    expect(handle).toBeNull();
    expect(getActiveSignals()).toEqual({
      metrics: false,
      traces: false,
      logs: false,
    });
  });

  it("unregisters everything when shut down", async () => {
    start(enabled());
    expect(getActiveSignals().traces).toBe(true);

    await handle!.shutdown();
    handle = null;

    expect(getActiveSignals()).toEqual({
      metrics: false,
      traces: false,
      logs: false,
    });
  });
});

describe("one request, end to end", () => {
  async function serveRequest(config: Observability) {
    const memory = inMemory();
    start(config, memory.seam);
    await simulateHostileRequest();
    await handle!.flush();
    return memory;
  }

  it("exports the request, its operation, their metrics and the log line — and none of the secrets", async () => {
    const { spans, metricData, logRecords } = await serveRequest(enabled());

    const exportedSpans = spans.getFinishedSpans();
    const request = exportedSpans.find(
      (span) => span.name === "POST /reviews",
    )!;
    const operation = exportedSpans.find(
      (span) => span.name === "review.submission",
    )!;
    expect(request.attributes).toEqual({
      "http.request.method": "POST",
      "http.route": "/reviews",
      "http.response.status_code": 200,
    });
    expect(operation.attributes).toMatchObject({
      "polyglot.operation": "reviews.submitAnswer",
      "polyglot.outcome": "succeeded",
    });
    // One trace: the operation is a child of the request.
    expect(operation.parentSpanContext?.spanId).toBe(
      request.spanContext().spanId,
    );
    expect(operation.spanContext().traceId).toBe(request.spanContext().traceId);
    // Next's own spans were never exported.
    expect(exportedSpans.map((span) => span.name).sort()).toEqual([
      "POST /reviews",
      "review.submission",
    ]);

    const names = metricData
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .map((metric) => metric.descriptor.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "http_server_requests_total",
        "http_server_request_duration_ms",
        "review_submission_total",
        "review_submission_duration_ms",
      ]),
    );

    const [record] = logRecords.getFinishedLogRecords();
    expect(record!.body).toBe("review.transaction.failed");
    expect(record!.spanContext?.traceId).toBe(request.spanContext().traceId);

    const everything = JSON.stringify({
      spans: exportedSpans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        status: span.status,
      })),
      metrics: metricData.getMetrics().map((resource) =>
        resource.scopeMetrics.map((scope) =>
          scope.metrics.map((metric) => ({
            name: metric.descriptor.name,
            points: metric.dataPoints.map((point) => point.attributes),
          })),
        ),
      ),
      logs: logRecords
        .getFinishedLogRecords()
        .map((log) => ({ body: log.body, attributes: log.attributes })),
    });
    for (const secret of NEVER_EXPORTED) {
      expect(everything, `"${secret}" must not be exported`).not.toContain(
        secret,
      );
    }
  });

  it("counts the request without exporting any span when traces are off", async () => {
    const { spans, metricData, logRecords } = await serveRequest(
      enabled({ traces: { state: "disabled" }, logs: { state: "disabled" } }),
    );

    expect(spans.getFinishedSpans()).toEqual([]);
    expect(logRecords.getFinishedLogRecords()).toEqual([]);
    const names = metricData
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .map((metric) => metric.descriptor.name);
    expect(names).toContain("http_server_requests_total");
  });
});
