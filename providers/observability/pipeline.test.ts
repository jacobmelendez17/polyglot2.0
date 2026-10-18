import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { APP_ENV: "production", RELEASE: "abc123", LOG_LEVEL: "debug" },
}));

import { resetInstrumentsForTests } from "@/lib/observability/instruments";
import { SecretValue, type TelemetryConfig } from "@/lib/telemetry-config";

import {
  NEVER_EXPORTED,
  simulateHostileRequest,
} from "@/providers/test-support/simulate-request";
import { startObservability, type ObservabilityHandle } from "./start";

/**
 * Spec 27 Units 27.5–27.6 over a real socket: the official OTLP/HTTP exporters,
 * behind this project's guards, talking to a local server that stands in for
 * Grafana's OTLP gateway. It proves what actually goes on the wire — where,
 * how it is authenticated, how it is encoded and, above all, what is *not* in
 * it — and that a receiver which is down, slow or failing can neither stall a
 * flush for long nor throw out of it.
 *
 * Nothing here reaches a real network: the receiver listens on 127.0.0.1.
 */

const TOKEN = `glc_${"b".repeat(30)}`;

type Received = {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

async function receiver(
  respond: (path: string) => number | "hang" = () => 200,
) {
  const received: Received[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const status = respond(request.url ?? "");
      if (status === "hang") return; // never answers
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end("{}");
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    received,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

function configFor(port: number): TelemetryConfig["observability"] {
  const connection = {
    endpoint: `http://127.0.0.1:${port}/otlp`,
    instanceId: "123456",
    token: new SecretValue(TOKEN),
  };
  return {
    metrics: { state: "enabled", connection },
    traces: { state: "enabled", connection, sampleRatio: 1 },
    logs: { state: "enabled", connection },
  };
}

let handle: ObservabilityHandle | null = null;
let closeReceiver: (() => Promise<void>) | null = null;

function start(port: number, exportTimeoutMillis = 1_000) {
  handle = startObservability(configFor(port), {
    environment: "production",
    release: "abc123",
    exportTimeoutMillis,
  });
  return handle!;
}

afterEach(async () => {
  await handle?.shutdown();
  handle = null;
  await closeReceiver?.();
  closeReceiver = null;
  resetInstrumentsForTests();
  vi.restoreAllMocks();
});

async function serve(respond?: (path: string) => number | "hang") {
  const server = await receiver(respond);
  closeReceiver = server.close;
  return server;
}

describe("what goes over the wire", () => {
  it("posts traces, metrics and logs to their OTLP paths, as JSON, with the Basic-auth credentials", async () => {
    const server = await serve();
    start(server.port);

    await simulateHostileRequest();
    await handle!.flush();

    const paths = server.received.map((request) => request.path).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        "/otlp/v1/logs",
        "/otlp/v1/metrics",
        "/otlp/v1/traces",
      ]),
    );
    for (const request of server.received) {
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.headers.authorization).toBe(
        `Basic ${Buffer.from(`123456:${TOKEN}`).toString("base64")}`,
      );
      expect(() => JSON.parse(request.body)).not.toThrow();
    }
  });

  it("names the service and the deployment on every signal", async () => {
    const server = await serve();
    start(server.port);

    await simulateHostileRequest();
    await handle!.flush();

    for (const request of server.received) {
      const resource = JSON.parse(request.body);
      const attributes = (resource.resourceSpans ??
        resource.resourceMetrics ??
        resource.resourceLogs)[0].resource.attributes as {
        key: string;
        value: { stringValue: string };
      }[];
      const byKey = Object.fromEntries(
        attributes.map((attribute) => [
          attribute.key,
          attribute.value.stringValue,
        ]),
      );
      expect(byKey).toMatchObject({
        "service.name": "polyglot",
        "service.version": "abc123",
        "deployment.environment.name": "production",
      });
      expect(byKey["service.instance.id"]).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("carries nothing sensitive in any request body — not the URL, the query, the email, the id, the message, the SQL, the journal or the token", async () => {
    const server = await serve();
    start(server.port);

    await simulateHostileRequest();
    await handle!.flush();

    expect(server.received.length).toBeGreaterThanOrEqual(3);
    for (const request of server.received) {
      for (const forbidden of [...NEVER_EXPORTED, TOKEN]) {
        expect(
          request.body,
          `"${forbidden}" must not be in the ${request.path} body`,
        ).not.toContain(forbidden);
      }
    }
  });

  it("exports the request and its operation as one trace, and the log line under the same trace id", async () => {
    const server = await serve();
    start(server.port);

    await simulateHostileRequest();
    await handle!.flush();

    const traceBody = JSON.parse(
      server.received.find((request) => request.path.endsWith("/traces"))!.body,
    );
    const spans = traceBody.resourceSpans[0].scopeSpans.flatMap(
      (scope: {
        spans: {
          name: string;
          traceId: string;
          spanId: string;
          parentSpanId?: string;
        }[];
      }) => scope.spans,
    );
    const request = spans.find(
      (span: { name: string }) => span.name === "POST /reviews",
    );
    const operation = spans.find(
      (span: { name: string }) => span.name === "review.submission",
    );
    expect(spans).toHaveLength(2);
    expect(operation.parentSpanId).toBe(request.spanId);
    expect(operation.traceId).toBe(request.traceId);

    const logBody = JSON.parse(
      server.received.find((entry) => entry.path.endsWith("/logs"))!.body,
    );
    const record = logBody.resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(record.body.stringValue).toBe("review.transaction.failed");
    expect(record.traceId).toBe(request.traceId);
    expect(record.spanId).toBe(operation.spanId);
  });

  it("exports the catalog's metrics and no others", async () => {
    const server = await serve();
    start(server.port);

    await simulateHostileRequest();
    await handle!.flush();

    const metricsBody = JSON.parse(
      server.received.find((request) => request.path.endsWith("/metrics"))!
        .body,
    );
    const names = metricsBody.resourceMetrics[0].scopeMetrics
      .flatMap((scope: { metrics: { name: string }[] }) => scope.metrics)
      .map((metric: { name: string }) => metric.name);
    expect(names.sort()).toEqual(
      [
        "http_server_request_duration_ms",
        "http_server_requests_total",
        "review_submission_duration_ms",
        "review_submission_total",
      ].sort(),
    );
  });
});

describe("when the receiver misbehaves", () => {
  it("counts a failed export, says nothing, and delivers the count with the next metrics", async () => {
    const noise = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
    ];
    const server = await serve((path) =>
      path.endsWith("/traces") ? 500 : 200,
    );
    start(server.port);

    await simulateHostileRequest();
    await handle!.flush();
    server.received.length = 0;
    await handle!.flush();

    const metricsBodies = server.received
      .filter((request) => request.path.endsWith("/metrics"))
      .map((request) => request.body);
    const failureCounter = metricsBodies.find((body) =>
      body.includes("telemetry_export_failure_total"),
    );
    expect(failureCounter).toBeDefined();
    expect(failureCounter).toContain('"traces"');
    // The error log the simulated request itself writes is the only console
    // output: a failed export adds none.
    const logged = noise
      .flatMap((spy) => spy.mock.calls.map(String))
      .join("\n");
    expect(logged).not.toMatch(/export|otlp|ECONN|500/i);
  });

  it("gives up on a receiver that is down, quickly, without throwing", async () => {
    const server = await receiver();
    const { port } = server;
    await server.close(); // nothing is listening now
    start(port, 500);

    await simulateHostileRequest();
    const startedAt = Date.now();
    await expect(handle!.flush()).resolves.toBeUndefined();

    expect(Date.now() - startedAt).toBeLessThan(4_000);
  });

  it("gives up on a receiver that accepts and never answers, within the timeout", async () => {
    const server = await serve(() => "hang");
    start(server.port, 300);

    await simulateHostileRequest();
    const startedAt = Date.now();
    await expect(handle!.flush()).resolves.toBeUndefined();

    expect(Date.now() - startedAt).toBeLessThan(4_000);
  });

  it("does not retry without bound against a gateway that keeps answering 503", async () => {
    const server = await serve(() => 503);
    start(server.port, 400);

    await simulateHostileRequest();
    const startedAt = Date.now();
    await handle!.flush();

    expect(Date.now() - startedAt).toBeLessThan(4_000);
    // A handful of attempts inside the timeout, not an open-ended storm.
    expect(server.received.length).toBeLessThan(30);
  });
});
