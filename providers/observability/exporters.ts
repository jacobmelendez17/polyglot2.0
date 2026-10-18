import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type {
  AggregationTemporality,
  InstrumentType,
  PushMetricExporter,
  ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from "@opentelemetry/sdk-logs";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

import { METRIC_ATTRIBUTE_KEYS } from "@/lib/observability/instruments";
import {
  sanitizeLogAttributes,
  sanitizeLogBody,
  SEVERITY_NUMBERS,
} from "@/lib/observability/log-projection";
import type { SecretValue } from "@/lib/telemetry-config";

import { sanitizeSpan } from "./span-sanitizer";

/**
 * Spec 27 Units 27.5–27.6 — the last gate before anything leaves the process.
 *
 * Each exporter here wraps the official OTLP/HTTP exporter and does four things
 * the stock one does not:
 *
 * - **Sanitizes again.** Spans are rebuilt from the span allowlist, metrics are
 *   limited to the catalog and its label sets, log records to the log
 *   allowlist — even if an earlier stage was bypassed or had a bug.
 * - **Counts failures, and says nothing.** A failed export increments
 *   `telemetry_export_failure_total{signal}` (spec 27 §7.2) and nothing else:
 *   no log line, no retry from here, so an outage cannot feed itself.
 * - **Never throws and never calls back twice.**
 * - **Bounds work.** One request per export, a hard timeout, and a small cap on
 *   requests in flight; the OTLP exporter's own retry runs only inside that
 *   timeout.
 *
 * Credentials: the token is read from its `SecretValue` here and nowhere else,
 * and lives only in the `Authorization` header of the exporter it builds.
 */

export const EXPORT_TIMEOUT_MS = 3_000;
const MAX_REQUESTS_IN_FLIGHT = 4;

export type Signal = "metrics" | "traces" | "logs";
type FailureHandler = () => void;

/** Runs one export through `send`, and reports exactly one result to `done`, never throwing. */
function guardedSend(
  send: (finish: (result: ExportResult) => void) => void,
  onFailure: FailureHandler,
  done: (result: ExportResult) => void,
): void {
  let settled = false;
  const finish = (result: ExportResult) => {
    if (settled) return;
    settled = true;
    if (result.code !== ExportResultCode.SUCCESS) {
      try {
        onFailure();
      } catch {
        // A failing counter must not become a second failure.
      }
    }
    done(result);
  };
  try {
    send(finish);
  } catch {
    finish({ code: ExportResultCode.FAILED });
  }
}

export class GuardedSpanExporter implements SpanExporter {
  readonly #inner: SpanExporter;
  readonly #onFailure: FailureHandler;

  constructor(inner: SpanExporter, onFailure: FailureHandler) {
    this.#inner = inner;
    this.#onFailure = onFailure;
  }

  export(
    spans: Parameters<SpanExporter["export"]>[0],
    resultCallback: (result: ExportResult) => void,
  ): void {
    guardedSend(
      (finish) => {
        const safe = spans.flatMap((span) => {
          const sanitized = sanitizeSpan(span);
          return sanitized ? [sanitized] : [];
        });
        if (safe.length === 0) {
          finish({ code: ExportResultCode.SUCCESS });
          return;
        }
        this.#inner.export(safe, finish);
      },
      this.#onFailure,
      resultCallback,
    );
  }

  async forceFlush(): Promise<void> {
    await this.#inner.forceFlush?.();
  }

  async shutdown(): Promise<void> {
    await this.#inner.shutdown();
  }
}

/** The catalog's metrics, with a data point kept only if every label on it is one its instrument may carry. */
export function sanitizeMetrics(metrics: ResourceMetrics): ResourceMetrics {
  return {
    resource: metrics.resource,
    scopeMetrics: metrics.scopeMetrics
      .map((scope) => ({
        scope: scope.scope,
        metrics: scope.metrics
          .filter((metric) =>
            Object.hasOwn(METRIC_ATTRIBUTE_KEYS, metric.descriptor.name),
          )
          .map((metric) => {
            const allowed = new Set(
              METRIC_ATTRIBUTE_KEYS[metric.descriptor.name],
            );
            return {
              ...metric,
              dataPoints: metric.dataPoints.filter((point) =>
                Object.keys(point.attributes).every((key) => allowed.has(key)),
              ),
            } as typeof metric;
          })
          .filter((metric) => metric.dataPoints.length > 0),
      }))
      .filter((scope) => scope.metrics.length > 0),
  };
}

export class GuardedMetricExporter implements PushMetricExporter {
  readonly #inner: PushMetricExporter;
  readonly #onFailure: FailureHandler;

  constructor(inner: PushMetricExporter, onFailure: FailureHandler) {
    this.#inner = inner;
    this.#onFailure = onFailure;
  }

  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): void {
    guardedSend(
      (finish) => {
        const safe = sanitizeMetrics(metrics);
        if (safe.scopeMetrics.length === 0) {
          finish({ code: ExportResultCode.SUCCESS });
          return;
        }
        this.#inner.export(safe, finish);
      },
      this.#onFailure,
      resultCallback,
    );
  }

  selectAggregationTemporality(
    instrumentType: InstrumentType,
  ): AggregationTemporality {
    return this.#inner.selectAggregationTemporality!(instrumentType);
  }

  selectAggregation(instrumentType: InstrumentType) {
    return this.#inner.selectAggregation!(instrumentType);
  }

  async forceFlush(): Promise<void> {
    await this.#inner.forceFlush();
  }

  async shutdown(): Promise<void> {
    await this.#inner.shutdown();
  }
}

const SEVERITY_VALUES: ReadonlySet<number> = new Set(
  Object.values(SEVERITY_NUMBERS),
);
const SEVERITY_TEXTS: ReadonlySet<string> = new Set(
  Object.keys(SEVERITY_NUMBERS).map((level) => level.toUpperCase()),
);

/** A log record rebuilt from the allowlist: sanitized body and attributes, a known severity, the span ids and nothing else. */
export function sanitizeLogRecord(
  record: ReadableLogRecord,
): ReadableLogRecord {
  return {
    hrTime: record.hrTime,
    hrTimeObserved: record.hrTimeObserved,
    spanContext: record.spanContext && {
      traceId: record.spanContext.traceId,
      spanId: record.spanContext.spanId,
      traceFlags: record.spanContext.traceFlags,
    },
    severityText:
      record.severityText && SEVERITY_TEXTS.has(record.severityText)
        ? record.severityText
        : undefined,
    severityNumber:
      record.severityNumber !== undefined &&
      SEVERITY_VALUES.has(record.severityNumber)
        ? record.severityNumber
        : undefined,
    body: sanitizeLogBody(record.body),
    resource: record.resource,
    instrumentationScope: { name: "polyglot" },
    attributes: sanitizeLogAttributes(
      record.attributes as Record<string, unknown>,
    ),
    droppedAttributesCount: 0,
  };
}

export class GuardedLogExporter implements LogRecordExporter {
  readonly #inner: LogRecordExporter;
  readonly #onFailure: FailureHandler;

  constructor(inner: LogRecordExporter, onFailure: FailureHandler) {
    this.#inner = inner;
    this.#onFailure = onFailure;
  }

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    guardedSend(
      (finish) => {
        if (logs.length === 0) {
          finish({ code: ExportResultCode.SUCCESS });
          return;
        }
        this.#inner.export(logs.map(sanitizeLogRecord), finish);
      },
      this.#onFailure,
      resultCallback,
    );
  }

  async forceFlush(): Promise<void> {
    await this.#inner.forceFlush();
  }

  async shutdown(): Promise<void> {
    await this.#inner.shutdown();
  }
}

export type OtlpTarget = {
  /** The Grafana OTLP base URL, e.g. https://otlp-gateway-prod-us-east-0.grafana.net/otlp */
  endpoint: string;
  /** The numeric stack id: the Basic-auth user name. */
  instanceId: string;
  token: SecretValue;
  timeoutMillis?: number;
};

function connection(target: OtlpTarget, path: "traces" | "metrics" | "logs") {
  return {
    url: `${target.endpoint.replace(/\/+$/, "")}/v1/${path}`,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${target.instanceId}:${target.token.reveal()}`,
      ).toString("base64")}`,
    },
    timeoutMillis: target.timeoutMillis ?? EXPORT_TIMEOUT_MS,
    concurrencyLimit: MAX_REQUESTS_IN_FLIGHT,
  };
}

export function createTraceExporter(
  target: OtlpTarget,
  onFailure: FailureHandler,
): SpanExporter {
  return new GuardedSpanExporter(
    new OTLPTraceExporter(connection(target, "traces")),
    onFailure,
  );
}

export function createMetricExporter(
  target: OtlpTarget,
  onFailure: FailureHandler,
): PushMetricExporter {
  return new GuardedMetricExporter(
    new OTLPMetricExporter(connection(target, "metrics")),
    onFailure,
  );
}

export function createLogExporter(
  target: OtlpTarget,
  onFailure: FailureHandler,
): LogRecordExporter {
  return new GuardedLogExporter(
    new OTLPLogExporter(connection(target, "logs")),
    onFailure,
  );
}
