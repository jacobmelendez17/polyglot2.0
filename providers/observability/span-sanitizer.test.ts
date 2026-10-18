import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sanitizeSpan } from "./span-sanitizer";

const SECRET = "hunter2-glc_AbCdEfGhIjKlMnOpQrStUv";
const REQUEST_ID = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
});
afterEach(async () => {
  context.disable();
  await provider.shutdown();
});

function finished(): ReadableSpan {
  return exporter.getFinishedSpans()[0]!;
}

describe("a request root", () => {
  function hostileRoot() {
    const span = provider.getTracer("next.js").startSpan("GET /items/[id]", {
      kind: SpanKind.SERVER,
      attributes: {
        "next.span_type": "BaseServer.handleRequest",
        "http.method": "GET",
        "http.target": `/items/42?token=${SECRET}`,
        "http.url": `https://example.com/items/42?token=${SECRET}`,
        "next.route": "/items/[id]",
        "http.route": "/items/[id]",
        "http.status_code": 200,
        "user.email": "someone@example.com",
        "next.rsc": false,
      },
    });
    span.recordException(new Error(`password=${SECRET}`));
    span.setStatus({ code: SpanStatusCode.ERROR, message: SECRET });
    span.end();
    return finished();
  }

  it("keeps the method, the route template and the status, and nothing else", () => {
    const safe = sanitizeSpan(hostileRoot())!;

    expect(safe.name).toBe("GET /items/:param");
    expect(safe.attributes).toEqual({
      "http.request.method": "GET",
      "http.route": "/items/:param",
      "http.response.status_code": 200,
    });
  });

  it("drops the events (an exception carries its message and stack), the links and the status message", () => {
    const safe = sanitizeSpan(hostileRoot())!;

    expect(safe.events).toEqual([]);
    expect(safe.links).toEqual([]);
    expect(safe.status).toEqual({ code: SpanStatusCode.ERROR });
  });

  it("leaves nothing of the URL, the query string, the email or the secret anywhere in what would be exported", () => {
    const safe = sanitizeSpan(hostileRoot())!;
    const serialized = JSON.stringify({
      name: safe.name,
      attributes: safe.attributes,
      events: safe.events,
      status: safe.status,
      links: safe.links,
      scope: safe.instrumentationScope,
      context: safe.spanContext(),
    });

    for (const forbidden of [
      SECRET,
      "token=",
      "someone@example.com",
      "example.com",
      "/items/42",
      "password",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not export a request root that has no route template — the proxy's own pass over a request, or a request it answered itself", () => {
    for (const attributes of [
      { "http.method": "GET", "http.status_code": 200 },
      { "http.method": "GET", "next.route": `/items/42?token=${SECRET}` },
      { "http.method": "GET", "next.route": "" },
    ]) {
      exporter.reset();
      provider
        .getTracer("next.js")
        .startSpan("GET", {
          attributes: {
            "next.span_type": "BaseServer.handleRequest",
            ...attributes,
          },
        })
        .end();

      expect(sanitizeSpan(finished())).toBeNull();
    }
  });

  it("reports an unknown method as OTHER and drops a status that is not one", () => {
    const span = provider.getTracer("next.js").startSpan("PROPFIND", {
      attributes: {
        "next.span_type": "BaseServer.handleRequest",
        "http.method": "PROPFIND",
        "next.route": "/dashboard",
        "http.status_code": 99999,
      },
    });
    span.end();

    const safe = sanitizeSpan(finished())!;

    expect(safe.attributes).toEqual({
      "http.request.method": "OTHER",
      "http.route": "/dashboard",
    });
    expect(safe.name).toBe("OTHER /dashboard");
  });

  it("drops a remote parent and the trace state it came with", () => {
    const remote = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });
    provider
      .getTracer("next.js")
      .startSpan(
        "GET",
        {
          attributes: {
            "next.span_type": "BaseServer.handleRequest",
            "next.route": "/dashboard",
          },
        },
        remote,
      )
      .end();

    const safe = sanitizeSpan(finished())!;

    expect(safe.parentSpanContext).toBeUndefined();
    expect(Object.keys(safe.spanContext()).sort()).toEqual([
      "spanId",
      "traceFlags",
      "traceId",
    ]);
  });
});

describe("an application operation", () => {
  function operationSpan(attributes: Record<string, string | number>) {
    const span = provider.getTracer("polyglot").startSpan("review.submission", {
      attributes: {
        "polyglot.operation": "reviews.submitAnswer",
        ...attributes,
      },
    });
    span.recordException(new Error(SECRET));
    span.end();
    return finished();
  }

  it("keeps its table name, its outcome, its error category and the request id", () => {
    const safe = sanitizeSpan(
      operationSpan({
        "polyglot.outcome": "expected_rejected",
        "polyglot.error_category": "STALE_REVIEW",
        "polyglot.trace_id": REQUEST_ID,
      }),
    )!;

    expect(safe.name).toBe("review.submission");
    expect(safe.attributes).toEqual({
      "polyglot.operation": "reviews.submitAnswer",
      "polyglot.outcome": "expected_rejected",
      "polyglot.error_category": "STALE_REVIEW",
      "polyglot.trace_id": REQUEST_ID,
    });
    expect(safe.events).toEqual([]);
  });

  it("drops an outcome, a category or a request id that is not one of the allowed shapes", () => {
    const safe = sanitizeSpan(
      operationSpan({
        "polyglot.outcome": `it worked for ${SECRET}`,
        "polyglot.error_category": "user@example.com failed",
        "polyglot.trace_id": `not-a-uuid-${SECRET}`,
        "user.id": "abc",
      }),
    )!;

    expect(safe.attributes).toEqual({
      "polyglot.operation": "reviews.submitAnswer",
    });
    expect(JSON.stringify(safe.attributes)).not.toContain(SECRET);
  });
});

describe("anything else", () => {
  it("is not exported at all", () => {
    for (const attributes of [
      {
        "next.span_type": "AppRender.fetch",
        "http.url": `https://x/?t=${SECRET}`,
      },
      { "polyglot.operation": "not.on.the.list" },
      { "polyglot.operation": "constructor" },
      {},
    ]) {
      exporter.reset();
      provider.getTracer("x").startSpan("whatever", { attributes }).end();
      expect(sanitizeSpan(finished())).toBeNull();
    }
  });
});
