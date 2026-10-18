import type { Attributes, SpanContext } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

import { findObservedOperation } from "@/lib/observability/operations";
import {
  normalizeMethod,
  normalizeRoute,
  statusClass,
  UNMATCHED_ROUTE,
} from "@/lib/observability/request-labels";

import { isRequestRootAttributes } from "./sampler";

/**
 * Spec 27 Unit 27.5 — the third gate (see `sampler.ts`): every span that leaves
 * the process is rebuilt from an allowlist here, so a span can carry only what
 * this file names.
 *
 * The span Next.js opens for a request has the raw URL — query string
 * included — in `http.target`; its `fetch` spans carry `http.url`; an exception
 * recorded on any span puts the error's message and stack into an event. None
 * of that is copied. A request root is rebuilt from its method, its route
 * *template* and its status; an application operation from its table name,
 * outcome and error category; the rest — events, links, status messages, every
 * other attribute, the parent's trace state — is dropped, and a span that is
 * neither is not exported at all.
 */

const OUTCOMES: ReadonlySet<string> = new Set([
  "accepted",
  "succeeded",
  "replayed",
  "expected_rejected",
  "unexpected_failed",
]);
const ERROR_CATEGORY = /^(?:[A-Z][A-Z0-9_]{1,59}|UNEXPECTED|OTHER)$/;
const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function safeSpanContext(context: SpanContext): SpanContext {
  // No trace state: it can carry a vendor's data from whoever called us.
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    traceFlags: context.traceFlags,
  };
}

function requestRootAttributes(source: Attributes): Attributes {
  const attributes: Attributes = {
    "http.request.method": normalizeMethod(source["http.method"]),
    "http.route": normalizeRoute(source["next.route"] ?? source["http.route"]),
  };
  const code = source["http.status_code"];
  if (typeof code === "number" && statusClass(code) !== "unknown") {
    attributes["http.response.status_code"] = code;
  }
  return attributes;
}

function operationAttributes(source: Attributes): Attributes {
  const attributes: Attributes = {
    "polyglot.operation": String(source["polyglot.operation"]),
  };
  const outcome = source["polyglot.outcome"];
  if (typeof outcome === "string" && OUTCOMES.has(outcome)) {
    attributes["polyglot.outcome"] = outcome;
  }
  const category = source["polyglot.error_category"];
  if (typeof category === "string" && ERROR_CATEGORY.test(category)) {
    attributes["polyglot.error_category"] = category;
  }
  const requestId = source["polyglot.trace_id"];
  if (typeof requestId === "string" && REQUEST_ID.test(requestId)) {
    attributes["polyglot.trace_id"] = requestId;
  }
  return attributes;
}

/** The exportable form of `span`, or `null` if it is not one of the two kinds that may leave the process. */
export function sanitizeSpan(span: ReadableSpan): ReadableSpan | null {
  let name: string;
  let attributes: Attributes;

  if (isRequestRootAttributes(span.attributes)) {
    attributes = requestRootAttributes(span.attributes);
    // No route template means the proxy's own pass over a request, or a request
    // it answered itself: not a trace worth exporting (see the lifecycle processor).
    if (attributes["http.route"] === UNMATCHED_ROUTE) return null;
    name = `${attributes["http.request.method"]} ${attributes["http.route"]}`;
  } else {
    const operation = span.attributes["polyglot.operation"];
    const definition =
      typeof operation === "string"
        ? findObservedOperation(operation)
        : undefined;
    if (!definition) return null;
    attributes = operationAttributes(span.attributes);
    name = definition.span;
  }

  const parent = span.parentSpanContext;
  return {
    name,
    kind: span.kind,
    spanContext: () => safeSpanContext(span.spanContext()),
    // A remote parent is somebody else's span, not part of our trace.
    parentSpanContext:
      parent && !parent.isRemote ? safeSpanContext(parent) : undefined,
    startTime: span.startTime,
    endTime: span.endTime,
    // The code only: a status message is free text.
    status: { code: span.status.code },
    attributes,
    links: [],
    events: [],
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: { name: "polyglot" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
}
