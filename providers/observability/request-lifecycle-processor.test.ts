import { context, metrics, SpanKind, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetInstrumentsForTests } from "@/lib/observability/instruments";

import { PolyglotSampler } from "./sampler";
import { RequestLifecycleProcessor } from "./request-lifecycle-processor";

const SECRET = "glc_AbCdEfGhIjKlMnOpQrStUv";

let provider: BasicTracerProvider;
const coordinator = { requestEnded: vi.fn() };
const record = vi.fn();
const captureWaitUntil = vi.fn();

function begin(
  overrides: Partial<
    ConstructorParameters<typeof RequestLifecycleProcessor>[0]
  > = {},
) {
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  provider = new BasicTracerProvider({
    sampler: new PolyglotSampler(0),
    spanProcessors: [
      new RequestLifecycleProcessor({
        environment: "production",
        coordinator,
        record,
        captureWaitUntil,
        ...overrides,
      }),
    ],
  });
}

function request(attributes: Record<string, string | number | boolean>) {
  const span = provider.getTracer("next.js").startSpan("GET", {
    kind: SpanKind.SERVER,
    attributes: { "next.span_type": "BaseServer.handleRequest", ...attributes },
  });
  return span;
}

beforeEach(() => {
  coordinator.requestEnded.mockReset();
  record.mockReset();
  captureWaitUntil.mockReset();
});
afterEach(async () => {
  context.disable();
  await provider?.shutdown();
});

describe("RequestLifecycleProcessor", () => {
  it("counts a finished request under bounded labels only", () => {
    begin();
    const span = request({
      "http.method": "get",
      "http.target": `/items/42?token=${SECRET}`,
    });
    span.setAttributes({
      "http.status_code": 200,
      "next.route": "/items/[id]",
      "http.route": "/items/[id]",
    });
    span.end();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      environment: "production",
      method: "GET",
      route: "/items/:param",
      statusClass: "2xx",
      operation: "page",
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain(SECRET);
  });

  it("does not count a request root that has no route template — and still lets it flush what is buffered", () => {
    begin();
    // What Next.js opens for the proxy's own pass over a request: no route, and
    // a status of 200 whatever the proxy then does.
    request({ "http.method": "GET", "http.status_code": 200 }).end();
    // A route that is not a template is not trusted as a label either.
    request({
      "http.method": "GET",
      "http.status_code": 404,
      "next.route": `/some/real/path?x=${SECRET}`,
    }).end();

    expect(record).not.toHaveBeenCalled();
    expect(coordinator.requestEnded).toHaveBeenCalledTimes(2);
  });

  it("counts a request once: the proxy's pass is ignored and the route's own span is the one counted", () => {
    begin();
    request({ "http.method": "GET", "http.status_code": 200 }).end(); // the proxy's pass
    request({
      "http.method": "GET",
      "http.status_code": 401,
      "next.route": "/api/v1/admin/overview",
    }).end(); // the request itself

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/api/v1/admin", statusClass: "4xx" }),
    );
  });

  it("classifies a Server Action, an API route and a failure", () => {
    begin();
    const action = request({
      "http.method": "POST",
      "http.status_code": 200,
      "next.route": "/reviews",
    });
    action.end();
    const api = request({
      "http.method": "GET",
      "http.status_code": 500,
      "next.route": "/api/v1/admin/overview",
    });
    api.end();

    expect(record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operation: "action", method: "POST" }),
    );
    expect(record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operation: "api",
        statusClass: "5xx",
        route: "/api/v1/admin",
      }),
    );
  });

  it("does not count the health probes as traffic, but still lets them flush what is buffered", () => {
    begin();
    for (const route of ["/api/health", "/api/health/ready"]) {
      const span = request({
        "http.method": "GET",
        "http.status_code": 200,
        "next.route": route,
      });
      span.end();
    }

    expect(record).not.toHaveBeenCalled();
    expect(coordinator.requestEnded).toHaveBeenCalledTimes(2);
  });

  it("ignores every span that is not a request root", () => {
    begin();
    provider
      .getTracer("polyglot")
      .startSpan("review.submission", {
        attributes: { "polyglot.operation": "reviews.submitAnswer" },
      })
      .end();

    expect(record).not.toHaveBeenCalled();
    expect(coordinator.requestEnded).not.toHaveBeenCalled();
  });

  it("takes the platform's waitUntil when the request starts and uses it when the request ends", () => {
    const waitUntil = vi.fn();
    captureWaitUntil.mockReturnValue(waitUntil);
    begin();

    const span = request({
      "http.method": "GET",
      "http.status_code": 200,
      "next.route": "/dashboard",
    });
    expect(captureWaitUntil).toHaveBeenCalledTimes(1);
    expect(coordinator.requestEnded).not.toHaveBeenCalled();
    span.end();

    expect(coordinator.requestEnded).toHaveBeenCalledWith(waitUntil);
  });

  it("passes nothing when the platform provides no waitUntil", () => {
    captureWaitUntil.mockReturnValue(undefined);
    begin();

    request({
      "http.method": "GET",
      "http.status_code": 200,
      "next.route": "/dashboard",
    }).end();

    expect(coordinator.requestEnded).toHaveBeenCalledWith(undefined);
  });

  it("cannot throw into the request it is observing, and still tells the coordinator", () => {
    record.mockImplementation(() => {
      throw new Error("metric failed");
    });
    captureWaitUntil.mockImplementation(() => {
      throw new Error("no context");
    });
    begin();
    const span = request({
      "http.method": "GET",
      "http.status_code": 200,
      "next.route": "/dashboard",
    });

    expect(() => span.end()).not.toThrow();
    expect(coordinator.requestEnded).toHaveBeenCalledTimes(1);

    coordinator.requestEnded.mockImplementation(() => {
      throw new Error("coordinator failed");
    });
    const second = request({
      "http.method": "GET",
      "http.status_code": 200,
      "next.route": "/dashboard",
    });
    expect(() => second.end()).not.toThrow();
  });
});

describe("with the real metric instruments", () => {
  let meterProvider: MeterProvider;
  let exporter: InMemoryMetricExporter;

  beforeEach(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    meterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 3_600_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);
    resetInstrumentsForTests();
  });
  afterEach(async () => {
    metrics.disable();
    resetInstrumentsForTests();
    await meterProvider.shutdown();
  });

  it("produces the two documented HTTP metrics with exactly the documented labels", async () => {
    begin({ record: undefined });
    const span = request({
      "http.method": "POST",
      "http.target": `/reviews?x=${SECRET}`,
    });
    span.setAttributes({ "http.status_code": 200, "next.route": "/reviews" });
    span.end();

    await meterProvider.forceFlush();
    const byName = new Map<string, { attributes: Record<string, unknown> }[]>();
    for (const resource of exporter.getMetrics()) {
      for (const scope of resource.scopeMetrics) {
        for (const metric of scope.metrics) {
          byName.set(metric.descriptor.name, metric.dataPoints as never);
        }
      }
    }

    expect(byName.get("http_server_requests_total")![0]!.attributes).toEqual({
      environment: "production",
      method: "POST",
      route: "/reviews",
      status_class: "2xx",
    });
    expect(
      byName.get("http_server_request_duration_ms")![0]!.attributes,
    ).toEqual({
      environment: "production",
      route: "/reviews",
      operation: "action",
    });
    expect(JSON.stringify([...byName])).not.toContain(SECRET);
    void trace;
  });
});
