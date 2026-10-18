import { randomUUID } from "node:crypto";

import { context, metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type LogRecordExporter,
} from "@opentelemetry/sdk-logs";
import {
  createAllowListAttributesProcessor,
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { logger } from "@/lib/logging/logger";
import {
  clearActiveSignals,
  setActiveSignals,
  type ActiveSignals,
} from "@/lib/observability/active";
import {
  METRIC_ATTRIBUTE_KEYS,
  recordTelemetryExportFailure,
} from "@/lib/observability/instruments";
import type {
  AppEnvironment,
  OtlpConnection,
  TelemetryConfig,
} from "@/lib/telemetry-config";

import { ExportCoordinator } from "./export-coordinator";
import {
  createLogExporter,
  createMetricExporter,
  createTraceExporter,
  EXPORT_TIMEOUT_MS,
  type OtlpTarget,
  type Signal,
} from "./exporters";
import { reportBlockedSignals } from "./report-blocked";
import { RequestLifecycleProcessor } from "./request-lifecycle-processor";
import { PolyglotSampler } from "./sampler";

/**
 * Spec 27 Units 27.5–27.6 — starts the OpenTelemetry SDK for whichever Grafana
 * signals are `enabled`, and nothing for the rest.
 *
 * Called once, from `instrumentation.ts`, before the server takes a request. It
 * is the only place that builds an SDK provider, and it:
 *
 * - **does nothing at all** unless at least one signal is `enabled` — no global
 *   is registered, no span is ever created, no byte is sent (spec 27 §4); a
 *   `blocked` signal is reported by name and stays off;
 * - **registers the providers globally** (and a context manager, without which
 *   nothing nests), because the application code that records to them lives in
 *   other bundles and reaches them through OpenTelemetry's own registry;
 * - **never throws** — telemetry misconfigured or failing must not stop the
 *   server (spec 27 §4) — and is idempotent, so a second call changes nothing.
 *
 * Buffers are bounded (spans 128, log records 256), exports are batched (64 per
 * request) with a 3-second timeout, and the periodic metric timer is a long
 * safety net: when data is actually sent is the `ExportCoordinator`'s policy.
 */

export type ObservabilityHandle = {
  readonly signals: ActiveSignals;
  /** Sends everything buffered, now. */
  flush(): Promise<void>;
  /** Stops the SDK and unregisters the globals. Used by tests; the server never calls it. */
  shutdown(): Promise<void>;
};

export type StartObservabilityDeps = {
  environment: AppEnvironment;
  release: string;
  /** Test seam: replaces the real OTLP exporters. Never set in production code. */
  exporters?: {
    traces?: (target: OtlpTarget, onFailure: () => void) => SpanExporter;
    metrics?: (target: OtlpTarget, onFailure: () => void) => PushMetricExporter;
    logs?: (target: OtlpTarget, onFailure: () => void) => LogRecordExporter;
  };
  /** Test seam for the blocked-configuration warning. */
  warn?: typeof logger.warn;
  /** Test seam: a shorter export timeout than the production 3 seconds. */
  exportTimeoutMillis?: number;
};

const HANDLE = Symbol.for("polyglot.observability.handle");
type HandleHolder = { [HANDLE]?: ObservabilityHandle };

const BATCH_LIMITS = {
  maxQueueSize: 128,
  maxExportBatchSize: 64,
  scheduledDelayMillis: 5_000,
  exportTimeoutMillis: EXPORT_TIMEOUT_MS,
};
const LOG_BATCH_LIMITS = { ...BATCH_LIMITS, maxQueueSize: 256 };
/** A backstop only: the coordinator sends metrics after requests; this covers an instance that stays alive and quiet. */
const METRIC_BACKSTOP_INTERVAL_MS = 300_000;

function targetOf(
  connection: OtlpConnection,
  deps: StartObservabilityDeps,
): OtlpTarget {
  return {
    endpoint: connection.endpoint,
    instanceId: connection.instanceId,
    token: connection.token,
    timeoutMillis: deps.exportTimeoutMillis,
  };
}

export function startObservability(
  config: TelemetryConfig["observability"],
  deps: StartObservabilityDeps,
): ObservabilityHandle | null {
  try {
    return start(config, deps);
  } catch {
    // Optional telemetry never stops the application from starting. Undo
    // whatever had already been registered, so a half-started SDK is not left
    // collecting data nobody will send.
    try {
      clearActiveSignals();
      trace.disable();
      metrics.disable();
      logs.disable();
      context.disable();
    } catch {
      // Nothing further to do.
    }
    return null;
  }
}

function start(
  config: TelemetryConfig["observability"],
  deps: StartObservabilityDeps,
): ObservabilityHandle | null {
  const holder = globalThis as HandleHolder;
  if (holder[HANDLE]) return holder[HANDLE];

  reportBlockedSignals(config, deps.warn ?? logger.warn);

  const traces = config.traces.state === "enabled" ? config.traces : null;
  const metricsConfig =
    config.metrics.state === "enabled" ? config.metrics : null;
  const logsConfig = config.logs.state === "enabled" ? config.logs : null;
  if (!traces && !metricsConfig && !logsConfig) return null;

  const resource = resourceFromAttributes({
    "service.name": "polyglot",
    "service.version": deps.release,
    "deployment.environment.name": deps.environment,
    // Serverless instances come and go; each needs its own identity or their
    // cumulative counters would overwrite one another in Grafana.
    "service.instance.id": randomUUID(),
  });
  const failureCounter = (signal: Signal) => () =>
    recordTelemetryExportFailure({ environment: deps.environment, signal });

  // Without a context manager an "active" span is not carried across awaits:
  // nothing nests, and a log line cannot find its span.
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );

  let meterProvider: MeterProvider | undefined;
  if (metricsConfig) {
    const exporter = (deps.exporters?.metrics ?? createMetricExporter)(
      targetOf(metricsConfig.connection, deps),
      failureCounter("metrics"),
    );
    meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: METRIC_BACKSTOP_INTERVAL_MS,
          exportTimeoutMillis: EXPORT_TIMEOUT_MS,
        }),
      ],
      // The label sets of the catalog, enforced at aggregation: a label added
      // to a call site by mistake is dropped here, before it can become a series.
      views: Object.entries(METRIC_ATTRIBUTE_KEYS).map(
        ([instrumentName, keys]) => ({
          instrumentName,
          attributesProcessors: [createAllowListAttributesProcessor([...keys])],
        }),
      ),
    });
    metrics.setGlobalMeterProvider(meterProvider);
  }

  let loggerProvider: LoggerProvider | undefined;
  if (logsConfig) {
    const exporter = (deps.exporters?.logs ?? createLogExporter)(
      targetOf(logsConfig.connection, deps),
      failureCounter("logs"),
    );
    loggerProvider = new LoggerProvider({
      resource,
      processors: [
        new BatchLogRecordProcessor({ exporter, ...LOG_BATCH_LIMITS }),
      ],
    });
    logs.setGlobalLoggerProvider(loggerProvider);
  }

  // The coordinator is built before the tracer provider it will flush, because
  // the lifecycle processor inside that provider needs it; its flushers read
  // the provider through this holder only when they run, after it exists.
  const tracing: { provider?: BasicTracerProvider } = {};
  const coordinator = new ExportCoordinator({
    flushers: {
      traces: traces ? () => tracing.provider!.forceFlush() : undefined,
      logs: loggerProvider ? () => loggerProvider.forceFlush() : undefined,
      metrics: meterProvider ? () => meterProvider.forceFlush() : undefined,
    },
  });

  // A tracer provider exists whenever any signal does: the request root span is
  // what counts requests and what tells the coordinator a request has ended.
  // With traces off, nothing is sampled for export (ratio 0) and there is no
  // exporter — spans are only recorded long enough to be counted.
  const spanProcessors: SpanProcessor[] = [];
  if (traces) {
    const exporter = (deps.exporters?.traces ?? createTraceExporter)(
      targetOf(traces.connection, deps),
      failureCounter("traces"),
    );
    spanProcessors.push(new BatchSpanProcessor(exporter, BATCH_LIMITS));
  }
  // Last, so that by the time it asks for a flush the batch processor has the span.
  spanProcessors.push(
    new RequestLifecycleProcessor({
      environment: deps.environment,
      coordinator,
    }),
  );
  const tracerProvider = new BasicTracerProvider({
    resource,
    sampler: new PolyglotSampler(traces ? traces.sampleRatio : 0),
    spanProcessors,
  });
  tracing.provider = tracerProvider;
  trace.setGlobalTracerProvider(tracerProvider);

  const signals: ActiveSignals = {
    metrics: Boolean(metricsConfig),
    traces: Boolean(traces),
    logs: Boolean(logsConfig),
  };
  setActiveSignals(signals);

  const handle: ObservabilityHandle = {
    signals,
    flush: () => coordinator.flushAll(),
    shutdown: async () => {
      coordinator.stop();
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider?.shutdown(),
        loggerProvider?.shutdown(),
      ]);
      trace.disable();
      metrics.disable();
      logs.disable();
      context.disable();
      clearActiveSignals();
      delete holder[HANDLE];
    },
  };
  holder[HANDLE] = handle;
  return handle;
}
