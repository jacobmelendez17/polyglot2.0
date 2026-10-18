import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  trace,
  TraceFlags,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SamplingDecision,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PolyglotSampler } from "./sampler";

const ROOT = { "next.span_type": "BaseServer.handleRequest" };
const OPERATION = { "polyglot.operation": "reviews.submitAnswer" };
const SAMPLED_TRACE_ID = "00000000000000000000000000000001";
// The ratio sampler XORs the trace id's four 32-bit chunks and samples when the
// result is below ratio × 0xffffffff. These two ids XOR to 1 (sampled at any
// ratio above 0) and to 0xffff0000 (outside any ratio below 1).
const UNSAMPLED_TRACE_ID = "ffffffff00000000000000000000ffff";

function decide(
  ratio: number,
  attributes: Record<string, string>,
  traceId = SAMPLED_TRACE_ID,
  parent = ROOT_CONTEXT,
) {
  return new PolyglotSampler(ratio).shouldSample(
    parent,
    traceId,
    "span",
    SpanKind.SERVER,
    attributes,
    [],
  ).decision;
}

describe("PolyglotSampler.shouldSample", () => {
  it.each([
    ["a render span", { "next.span_type": "AppRender.getBodyResult" }],
    [
      "a fetch span carrying a raw URL",
      { "next.span_type": "AppRender.fetch", "http.url": "https://x/?token=1" },
    ],
    ["a span from some other library", { "db.system": "postgresql" }],
    ["a span with no attributes", {}],
  ])("does not record %s at all", (_label, attributes) => {
    expect(decide(1, attributes)).toBe(SamplingDecision.NOT_RECORD);
  });

  it("records the request root Next.js opens", () => {
    expect(decide(1, ROOT)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("records the application's own operation spans", () => {
    expect(decide(1, OPERATION)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("samples at the configured ratio, but still records the rest so request metrics see every request", () => {
    expect(decide(0.05, ROOT, SAMPLED_TRACE_ID)).toBe(
      SamplingDecision.RECORD_AND_SAMPLED,
    );
    expect(decide(0.05, ROOT, UNSAMPLED_TRACE_ID)).toBe(
      SamplingDecision.RECORD,
    );
  });

  it("never samples at ratio 0, and always samples at ratio 1", () => {
    expect(decide(0, ROOT, SAMPLED_TRACE_ID)).toBe(SamplingDecision.RECORD);
    expect(decide(1, ROOT, UNSAMPLED_TRACE_ID)).toBe(
      SamplingDecision.RECORD_AND_SAMPLED,
    );
  });

  it.each([
    [NaN, SamplingDecision.RECORD],
    [-3, SamplingDecision.RECORD],
    [Infinity, SamplingDecision.RECORD],
    [7, SamplingDecision.RECORD_AND_SAMPLED],
  ])("clamps a ratio of %s into range", (ratio, expected) => {
    expect(decide(ratio, ROOT, UNSAMPLED_TRACE_ID)).toBe(expected);
  });

  it("lets a child follow its local parent's decision, so a trace is all exported or none of it", () => {
    const sampledParent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: UNSAMPLED_TRACE_ID,
      spanId: "0000000000000001",
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    });
    const unsampledParent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: SAMPLED_TRACE_ID,
      spanId: "0000000000000001",
      traceFlags: TraceFlags.NONE,
      isRemote: false,
    });

    expect(decide(0, OPERATION, UNSAMPLED_TRACE_ID, sampledParent)).toBe(
      SamplingDecision.RECORD_AND_SAMPLED,
    );
    expect(decide(1, OPERATION, SAMPLED_TRACE_ID, unsampledParent)).toBe(
      SamplingDecision.RECORD,
    );
  });

  it("ignores a remote parent's sampled flag, so a client cannot force a trace by sending a header", () => {
    const remote = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: UNSAMPLED_TRACE_ID,
      spanId: "0000000000000001",
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });

    expect(decide(0, ROOT, UNSAMPLED_TRACE_ID, remote)).toBe(
      SamplingDecision.RECORD,
    );
  });

  it("describes itself without a secret", () => {
    expect(new PolyglotSampler(0.05).toString()).toBe(
      "PolyglotSampler{ratio=0.05}",
    );
  });
});

describe("a tracer provider using it", () => {
  let exporter: InMemorySpanExporter;
  let ended: ReadableSpan[];
  let provider: BasicTracerProvider;

  const watcher: SpanProcessor = {
    onStart: () => undefined,
    onEnd: (span) => void ended.push(span),
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  };

  function begin(ratio: number) {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
    exporter = new InMemorySpanExporter();
    ended = [];
    provider = new BasicTracerProvider({
      sampler: new PolyglotSampler(ratio),
      spanProcessors: [watcher, new SimpleSpanProcessor(exporter)],
    });
  }

  beforeEach(() => {
    ended = [];
  });
  afterEach(async () => {
    context.disable();
    await provider?.shutdown();
  });

  it("shows processors every request root but exports none of them at ratio 0", () => {
    begin(0);
    provider.getTracer("next.js").startSpan("GET", { attributes: ROOT }).end();

    expect(ended).toHaveLength(1);
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it("exports a sampled request root and drops Next's other spans before any processor sees them", () => {
    begin(1);
    const tracer = provider.getTracer("next.js");
    tracer.startSpan("GET", { attributes: ROOT }).end();
    tracer
      .startSpan("fetch GET https://example.com/?token=1", {
        attributes: { "next.span_type": "AppRender.fetch" },
      })
      .end();

    expect(ended.map((span) => span.name)).toEqual(["GET"]);
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });
});
