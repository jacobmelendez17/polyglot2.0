import {
  metrics,
  type Counter,
  type Histogram,
  type Attributes,
} from "@opentelemetry/api";

import type {
  HttpMethodLabel,
  RequestOperationLabel,
  StatusClassLabel,
} from "./request-labels";
import type { MetricFamily, OperationOutcome } from "./operations";

/**
 * Spec 27 Unit 27.5 — the metric catalog (spec 27 §7.2), and the one place
 * application code records to it.
 *
 * It talks to OpenTelemetry's *API* only. With no SDK registered — the default,
 * and every test — the API hands back no-op instruments, so recording costs
 * nothing and sends nothing. `providers/observability` registers the SDK, and
 * the same instruments start counting.
 *
 * Every function takes already-normalised, typed labels (see
 * `request-labels.ts`), so a caller cannot pass a user, a URL or an error
 * message as a label; `METRIC_ATTRIBUTE_KEYS` is also enforced by the SDK as
 * views, so a label added here by mistake is dropped before it is exported.
 * None of these functions throws.
 */

export const METER_NAME = "polyglot";

/**
 * Histogram bucket boundaries, in milliseconds. Doubling from 25 ms brackets the
 * interactive budgets of spec 27 §2 (a review submission under about 400 ms)
 * with ten boundaries, which keeps each labelled histogram to twelve series.
 */
export const DURATION_BUCKETS_MS = [
  10, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400,
] as const;

export const METRIC_NAMES = {
  httpRequests: "http_server_requests_total",
  httpDuration: "http_server_request_duration_ms",
  reviewSubmissions: "review_submission_total",
  reviewDuration: "review_submission_duration_ms",
  lessonCompletions: "lesson_completion_total",
  databaseDuration: "database_operation_duration_ms",
  databaseConnectionFailures: "database_connection_failure_total",
  exportFailures: "telemetry_export_failure_total",
} as const;

/** The only labels each instrument may carry. */
export const METRIC_ATTRIBUTE_KEYS: Readonly<
  Record<string, readonly string[]>
> = {
  [METRIC_NAMES.httpRequests]: [
    "environment",
    "method",
    "route",
    "status_class",
  ],
  [METRIC_NAMES.httpDuration]: ["environment", "route", "operation"],
  [METRIC_NAMES.reviewSubmissions]: [
    "environment",
    "outcome",
    "error_category",
  ],
  [METRIC_NAMES.reviewDuration]: ["environment", "outcome"],
  [METRIC_NAMES.lessonCompletions]: ["environment", "outcome"],
  [METRIC_NAMES.databaseDuration]: ["environment", "operation", "outcome"],
  [METRIC_NAMES.databaseConnectionFailures]: ["environment", "provider"],
  [METRIC_NAMES.exportFailures]: ["environment", "signal"],
};

type Instruments = {
  httpRequests: Counter;
  httpDuration: Histogram;
  reviewSubmissions: Counter;
  reviewDuration: Histogram;
  lessonCompletions: Counter;
  databaseDuration: Histogram;
  databaseConnectionFailures: Counter;
  exportFailures: Counter;
};

let cached: Instruments | undefined;

function durationHistogram(
  meter: ReturnType<typeof metrics.getMeter>,
  name: string,
  description: string,
): Histogram {
  return meter.createHistogram(name, {
    description: `${description} (milliseconds)`,
    unit: "ms",
    advice: { explicitBucketBoundaries: [...DURATION_BUCKETS_MS] },
  });
}

function instruments(): Instruments {
  if (cached) return cached;
  // Created on first use, which is after `instrumentation.ts` has registered
  // the SDK (it finishes before the server takes a request). Instruments made
  // earlier would be bound to the no-op meter for good.
  const meter = metrics.getMeter(METER_NAME);
  cached = {
    httpRequests: meter.createCounter(METRIC_NAMES.httpRequests, {
      description: "Eligible HTTP requests served",
      unit: "1",
    }),
    httpDuration: durationHistogram(
      meter,
      METRIC_NAMES.httpDuration,
      "Eligible HTTP request latency",
    ),
    reviewSubmissions: meter.createCounter(METRIC_NAMES.reviewSubmissions, {
      description: "Review answer submissions by outcome",
      unit: "1",
    }),
    reviewDuration: durationHistogram(
      meter,
      METRIC_NAMES.reviewDuration,
      "Review answer submission duration",
    ),
    lessonCompletions: meter.createCounter(METRIC_NAMES.lessonCompletions, {
      description: "Lesson completions by outcome",
      unit: "1",
    }),
    databaseDuration: durationHistogram(
      meter,
      METRIC_NAMES.databaseDuration,
      "Database operation duration",
    ),
    databaseConnectionFailures: meter.createCounter(
      METRIC_NAMES.databaseConnectionFailures,
      { description: "Database connection failures", unit: "1" },
    ),
    exportFailures: meter.createCounter(METRIC_NAMES.exportFailures, {
      description: "Telemetry exports that failed",
      unit: "1",
    }),
  };
  return cached;
}

/** Test support: forget the cached instruments so the next use binds to the current meter provider. */
export function resetInstrumentsForTests(): void {
  cached = undefined;
}

function safely(record: () => void): void {
  try {
    record();
  } catch {
    // Telemetry must never be able to fail the work it describes.
  }
}

export function recordHttpRequest(input: {
  environment: string;
  method: HttpMethodLabel;
  route: string;
  statusClass: StatusClassLabel;
  operation: RequestOperationLabel;
  durationMs: number;
}): void {
  safely(() => {
    const { httpRequests, httpDuration } = instruments();
    httpRequests.add(1, {
      environment: input.environment,
      method: input.method,
      route: input.route,
      status_class: input.statusClass,
    });
    httpDuration.record(input.durationMs, {
      environment: input.environment,
      route: input.route,
      operation: input.operation,
    });
  });
}

export function recordOperation(input: {
  family: MetricFamily;
  environment: string;
  outcome: OperationOutcome;
  /** A domain error code, or `none` when the outcome was not a refusal. */
  errorCategory: string;
  durationMs: number;
}): void {
  safely(() => {
    const set = instruments();
    if (input.family === "review_submission") {
      set.reviewSubmissions.add(1, {
        environment: input.environment,
        outcome: input.outcome,
        error_category: input.errorCategory,
      });
      set.reviewDuration.record(input.durationMs, {
        environment: input.environment,
        outcome: input.outcome,
      });
      return;
    }
    set.lessonCompletions.add(1, {
      environment: input.environment,
      outcome: input.outcome,
    });
  });
}

export function recordDatabaseOperation(input: {
  environment: string;
  operation: "transaction" | "readiness_check";
  outcome: "success" | "failure";
  durationMs: number;
}): void {
  safely(() => {
    instruments().databaseDuration.record(input.durationMs, {
      environment: input.environment,
      operation: input.operation,
      outcome: input.outcome,
    });
  });
}

export function recordDatabaseConnectionFailure(input: {
  environment: string;
  provider: "neon";
}): void {
  safely(() => {
    instruments().databaseConnectionFailures.add(1, {
      environment: input.environment,
      provider: input.provider,
    } satisfies Attributes);
  });
}

export function recordTelemetryExportFailure(input: {
  environment: string;
  signal: "metrics" | "traces" | "logs";
}): void {
  safely(() => {
    instruments().exportFailures.add(1, {
      environment: input.environment,
      signal: input.signal,
    });
  });
}
