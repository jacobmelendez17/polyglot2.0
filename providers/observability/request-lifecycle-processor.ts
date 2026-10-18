import type { Context } from "@opentelemetry/api";
import { hrTimeToMilliseconds } from "@opentelemetry/core";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

import { recordHttpRequest } from "@/lib/observability/instruments";
import {
  isHealthRoute,
  normalizeMethod,
  normalizeRoute,
  requestOperation,
  statusClass,
  UNMATCHED_ROUTE,
} from "@/lib/observability/request-labels";

import type { ExportCoordinator } from "./export-coordinator";
import { isRequestRootAttributes } from "./sampler";
import { captureWaitUntil, type WaitUntil } from "./wait-until";

/**
 * Spec 27 Unit 27.5 — what happens when Next.js finishes a request.
 *
 * The request root span is the one complete, framework-owned record that a
 * request was served: every page render, route handler and Server Action ends
 * one. This processor turns each into `http_server_requests_total` and
 * `http_server_request_duration_ms` (so the counts are exact, not sampled), and
 * tells the export coordinator a request has ended so buffered telemetry is
 * sent before the function can be frozen.
 *
 * Only labels from `request-labels.ts` are ever used — a method from a fixed
 * list, a route *template*, a status class — never the raw URL the span carries.
 * A request root with no route template is not counted (see `onEnd`).
 * The health probes are not "eligible" traffic for the SLIs (spec 27 §9.3), so
 * they are not counted, but they do trigger a flush: a probe every five minutes
 * also drains any telemetry a quiet instance was holding.
 *
 * Nothing here can throw into the request: Next.js calls `onEnd` as it finishes
 * the response.
 */

export type RequestLifecycleDeps = {
  environment: string;
  coordinator: Pick<ExportCoordinator, "requestEnded">;
  /** Injected for tests. */
  record?: typeof recordHttpRequest;
  captureWaitUntil?: () => WaitUntil | undefined;
};

export class RequestLifecycleProcessor implements SpanProcessor {
  readonly #deps: RequestLifecycleDeps;
  // The platform's request context is only reachable while the request is
  // running, so it is taken when the root span starts and used when it ends.
  readonly #waitUntil = new WeakMap<object, WaitUntil>();

  constructor(deps: RequestLifecycleDeps) {
    this.#deps = deps;
  }

  onStart(span: Span, parentContext: Context): void {
    void parentContext;
    try {
      if (!isRequestRootAttributes(span.attributes)) return;
      const waitUntil = (this.#deps.captureWaitUntil ?? captureWaitUntil)();
      if (waitUntil) this.#waitUntil.set(span, waitUntil);
    } catch {
      // See above.
    }
  }

  onEnd(span: ReadableSpan): void {
    if (!isRequestRootAttributes(span.attributes)) return;
    try {
      const method = normalizeMethod(span.attributes["http.method"]);
      const route = normalizeRoute(
        span.attributes["next.route"] ?? span.attributes["http.route"],
      );
      // A root span with no route template is not a request to count: Next.js
      // opens one for the proxy's own pass over a request (which reports status
      // 200 whatever the proxy then does), and a request the proxy answered by
      // itself — a sign-in redirect — never reaches a route. Counting either
      // would double every request and invent an `unmatched` 2xx.
      if (route !== UNMATCHED_ROUTE && !isHealthRoute(route)) {
        (this.#deps.record ?? recordHttpRequest)({
          environment: this.#deps.environment,
          method,
          route,
          statusClass: statusClass(span.attributes["http.status_code"]),
          operation: requestOperation(method, route),
          durationMs: Math.max(0, hrTimeToMilliseconds(span.duration)),
        });
      }
    } catch {
      // See above.
    }
    try {
      this.#deps.coordinator.requestEnded(this.#waitUntil.get(span));
    } catch {
      // See above.
    }
  }

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}
