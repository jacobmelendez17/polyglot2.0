import { context, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { APP_ENV: "production", RELEASE: "abc123", LOG_LEVEL: "debug" },
}));

import {
  clearActiveSignals,
  setActiveSignals,
} from "@/lib/observability/active";

import { logger } from "./logger";
import { runInTraceContext } from "./trace-context";

let exporter: InMemoryLogRecordExporter;
let loggerProvider: LoggerProvider;
let consoleLines: string[];

function begin(active = true) {
  exporter = new InMemoryLogRecordExporter();
  loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  if (active) setActiveSignals({ logs: true, traces: false, metrics: false });
}

beforeEach(() => {
  consoleLines = [];
  for (const method of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((line: unknown) => {
      consoleLines.push(String(line));
    });
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  clearActiveSignals();
  logs.disable();
  context.disable();
  trace.disable();
  await loggerProvider?.shutdown();
});

describe("the logger's export hook", () => {
  it("exports a warning as the validated projection, and still writes the local line", () => {
    begin();

    logger.warn({
      event: "review.transaction.failed",
      errorCode: "STALE_REVIEW",
      userId: "11111111-2222-3333-4444-555555555555",
      message: "failed for someone@example.com",
    });

    const [record] = exporter.getFinishedLogRecords();
    expect(record!.body).toBe("review.transaction.failed");
    expect(record!.severityText).toBe("WARN");
    expect(record!.attributes).toEqual({
      "event.name": "review.transaction.failed",
      "polyglot.error_code": "STALE_REVIEW",
    });
    // The local diagnostic line keeps its existing content.
    expect(consoleLines).toHaveLength(1);
    expect(consoleLines[0]).toContain("someone@example.com");
  });

  it("exports nothing below warn", () => {
    begin();

    logger.debug({ event: "a.b" });
    logger.info({ event: "route.completed", status: 200 });

    expect(exporter.getFinishedLogRecords()).toEqual([]);
    expect(consoleLines).toHaveLength(2);
  });

  it("puts no secret, stack, message or id into an exported record, whatever key it arrives under", () => {
    begin();

    logger.error({
      event: "route.something.failed",
      error: new Error("password=hunter2 for someone@example.com"),
      sql: "SELECT * FROM users",
      journal: "my private journal entry",
      userId: "11111111-2222-3333-4444-555555555555",
    });

    const serialized = JSON.stringify(
      exporter.getFinishedLogRecords().map((record) => ({
        body: record.body,
        attributes: record.attributes,
      })),
    );
    for (const secret of [
      "hunter2",
      "someone@example.com",
      "SELECT",
      "journal",
      "11111111",
      "stack",
      "at ",
    ]) {
      expect(serialized, `"${secret}" must not be exported`).not.toContain(
        secret,
      );
    }
    expect(serialized).toContain("route.something.failed");
    expect(serialized).toContain("Error"); // the error's class name only
  });

  it("does nothing, and costs nothing, while no log exporter is running", () => {
    begin(false);

    logger.error({ event: "review.transaction.failed" });

    expect(exporter.getFinishedLogRecords()).toEqual([]);
    expect(consoleLines).toHaveLength(1);
  });

  it("carries the active span's ids, so a failure's log line and its trace are found together", () => {
    begin();
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
    const tracerProvider = new BasicTracerProvider();
    trace.setGlobalTracerProvider(tracerProvider);

    runInTraceContext("reviews.submitAnswer", () => {
      trace
        .getTracer("polyglot")
        .startActiveSpan("review.submission", (span) => {
          logger.error({ event: "review.transaction.failed" });
          span.end();
        });
    });

    const [record] = exporter.getFinishedLogRecords();
    expect(record!.spanContext?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(record!.spanContext?.spanId).toMatch(/^[0-9a-f]{16}$/);
    // Spec 24's own request id rides along as a plain attribute for searching.
    expect(record!.attributes["polyglot.trace_id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-/,
    );
    expect(record!.attributes["polyglot.operation"]).toBe(
      "reviews.submitAnswer",
    );
  });

  it("cannot throw into the caller, nor log about itself, when the provider fails", () => {
    begin();
    logs.disable();
    logs.setGlobalLoggerProvider({
      getLogger: () => ({
        enabled: () => true,
        emit: () => {
          throw new Error("exporter is broken");
        },
      }),
    });

    expect(() =>
      logger.error({ event: "review.transaction.failed" }),
    ).not.toThrow();
    expect(consoleLines).toHaveLength(1); // only the original line
  });
});
