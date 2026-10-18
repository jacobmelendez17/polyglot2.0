import {
  isSpanContextValid,
  trace,
  TraceFlags,
  type Attributes,
  type Context,
  type Link,
  type SpanKind,
} from "@opentelemetry/api";
import {
  SamplingDecision,
  TraceIdRatioBasedSampler,
  type Sampler,
  type SamplingResult,
} from "@opentelemetry/sdk-trace-base";

/**
 * Spec 27 Unit 27.5 — which spans exist at all, and which of them are exported.
 *
 * Once a tracer provider is registered, Next.js starts emitting its own spans
 * (a render, every `fetch`, metadata, module loading…) alongside ours, and
 * several carry raw URLs. This sampler is the first of the three gates that keep
 * them out:
 *
 * 1. **Only two kinds of span are recorded at all** — the request root Next.js
 *    opens for every request (`BaseServer.handleRequest`), which is where the
 *    HTTP metrics come from, and the application's own operation spans (marked
 *    `polyglot.operation`, see `lib/logging/operation-telemetry.ts`). Everything
 *    else is `NOT_RECORD`, so it costs next to nothing and no processor sees it.
 * 2. **A recorded span is exported only if it is sampled** (head sampling at the
 *    configured ratio, 5% by default). The other 95% are `RECORD`: processors
 *    see them — that is how request metrics count *every* request — but the
 *    batch exporter ignores a span without the sampled flag.
 * 3. `span-sanitizer.ts` rebuilds whatever is exported from an allowlist.
 *
 * A remote parent's sampling flag is deliberately ignored. A client could send a
 * `traceparent` header with the sampled bit set and otherwise make every request
 * of its choosing a fully exported trace, bypassing the ratio.
 */

/** The `next.span_type` of the root span Next.js opens for each request. */
export const NEXT_REQUEST_SPAN_TYPE = "BaseServer.handleRequest";

export function isRequestRootAttributes(attributes: Attributes): boolean {
  return attributes["next.span_type"] === NEXT_REQUEST_SPAN_TYPE;
}

export function isOperationAttributes(attributes: Attributes): boolean {
  return typeof attributes["polyglot.operation"] === "string";
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

export class PolyglotSampler implements Sampler {
  readonly #ratio: number;
  readonly #byTraceId: TraceIdRatioBasedSampler;

  constructor(ratio: number) {
    this.#ratio = clampRatio(ratio);
    this.#byTraceId = new TraceIdRatioBasedSampler(this.#ratio);
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    void links;
    if (
      !isRequestRootAttributes(attributes) &&
      !isOperationAttributes(attributes)
    ) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    const parent = trace.getSpanContext(context);
    const sampled =
      parent && isSpanContextValid(parent) && !parent.isRemote
        ? (parent.traceFlags & TraceFlags.SAMPLED) !== 0
        : this.#byTraceId.shouldSample(context, traceId).decision ===
          SamplingDecision.RECORD_AND_SAMPLED;

    void spanName;
    void spanKind;
    return {
      decision: sampled
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.RECORD,
    };
  }

  toString(): string {
    return `PolyglotSampler{ratio=${this.#ratio}}`;
  }
}
