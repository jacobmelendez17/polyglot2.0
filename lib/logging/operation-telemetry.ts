import { AsyncLocalStorage } from "node:async_hooks";

import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";

import { env } from "@/lib/env";
import { getActiveSignals } from "@/lib/observability/active";
import { METER_NAME, recordOperation } from "@/lib/observability/instruments";
import {
  classifyFailure,
  findObservedOperation,
  type ObservedOperation,
  type OperationOutcome,
} from "@/lib/observability/operations";

import { isExpectedDomainError } from "./domain-error";
import { getTraceContext } from "./trace-context";

/**
 * Spec 27 Unit 27.5 — bridges the Spec 24 operation tracer (`withTrace`) to
 * OpenTelemetry spans and the metric catalog, so one traced operation is one
 * span, one set of metrics and the same log lines, not three separate
 * instruments.
 *
 * It only acts for the operations listed in `OBSERVED_OPERATIONS`, and only
 * while a telemetry signal is running. Otherwise `observeOperation` returns
 * `fn()` untouched — no span, no timing, no extra promise — so an
 * installation with telemetry off behaves exactly as it did before spec 27.
 * Nothing here ever changes what `fn` returns or throws, and recording a metric
 * or ending a span cannot throw into the work it describes.
 */

type CommitScope = { committed: boolean };

// One scope per outermost observed operation, shared by the operations nested
// inside it: a review answer (`reviews.submitAnswer`) contains the item
// commit (`review.transaction`), and both must know whether new work was
// committed.
const commitScope = new AsyncLocalStorage<CommitScope>();

/**
 * Called by domain code at the one point that only a *first execution* of an
 * idempotent transaction reaches — the same point that queues an analytics
 * event — to say "this call committed new work". A replay returns the stored
 * result without reaching it, which is how a replay is told apart from a
 * success without double-counting (spec 27 §7.2, "do not double-count success
 * on retries"). A no-op outside an observed operation.
 */
export function markOperationCommitted(): void {
  try {
    const scope = commitScope.getStore();
    if (scope) scope.committed = true;
  } catch {
    // Instrumentation must never fail the work it describes.
  }
}

type Settled = { outcome: OperationOutcome; errorCategory: string };

function elapsedMs(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}

function endSpan(span: Span, settled: Settled): void {
  try {
    span.setAttribute("polyglot.outcome", settled.outcome);
    if (settled.errorCategory !== "none") {
      span.setAttribute("polyglot.error_category", settled.errorCategory);
    }
    // The status code only: a status *message* is free text.
    if (settled.outcome === "unexpected_failed") {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  } catch {
    // See above.
  }
}

function recordMetrics(
  definition: ObservedOperation,
  settled: Settled,
  startedAt: number,
): void {
  if (!definition.metric || !getActiveSignals().metrics) return;
  recordOperation({
    family: definition.metric,
    environment: env.APP_ENV,
    outcome: settled.outcome,
    errorCategory: settled.errorCategory,
    durationMs: elapsedMs(startedAt),
  });
}

export async function observeOperation<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const definition = findObservedOperation(operation);
  const signals = getActiveSignals();
  if (!definition || (!signals.traces && !signals.metrics)) return fn();

  const startedAt = performance.now();
  const existingScope = commitScope.getStore();
  const scope: CommitScope = existingScope ?? { committed: false };
  const settled: Settled = { outcome: "succeeded", errorCategory: "none" };

  const run = async (): Promise<T> => {
    try {
      const result = await (existingScope ? fn() : commitScope.run(scope, fn));
      settled.outcome = definition.resolved(scope.committed);
      return result;
    } catch (error) {
      const failure = classifyFailure(
        isExpectedDomainError(error) ? error : null,
      );
      settled.outcome = failure.outcome;
      settled.errorCategory = failure.category;
      throw error;
    }
  };

  if (!signals.traces) {
    try {
      return await run();
    } finally {
      recordMetrics(definition, settled, startedAt);
    }
  }

  const correlationId = getTraceContext()?.traceId;
  // `started` tells a failure of the work (which must propagate) from a failure
  // of the tracer before it ever ran the work (which must not cost the learner
  // their request: the work then simply runs without a span).
  let started = false;
  try {
    return await trace.getTracer(METER_NAME).startActiveSpan(
      definition.span,
      {
        attributes: {
          // The operation name is what the sampler recognises an application
          // span by (it cannot see which tracer made a span).
          "polyglot.operation": operation,
          // Spec 24's request id, so a span and the log lines of the same
          // request can be searched together (spec 27 §8).
          ...(correlationId ? { "polyglot.trace_id": correlationId } : {}),
        },
      },
      async (span) => {
        started = true;
        try {
          return await run();
        } finally {
          endSpan(span, settled);
          recordMetrics(definition, settled, startedAt);
        }
      },
    );
  } catch (error) {
    if (started) throw error;
  }

  try {
    return await run();
  } finally {
    recordMetrics(definition, settled, startedAt);
  }
}
