/**
 * Spec 27 Unit 27.5 — keeping a serverless function alive until its telemetry
 * has been delivered.
 *
 * A function can be frozen the moment its response is sent, so an export that
 * is merely started may never finish (spec 27 §6.3, §7.1: "direct OTLP export is
 * best-effort in serverless"). Vercel exposes the running request's context on a
 * registered global symbol — the same one `@vercel/functions`' documented
 * `waitUntil` reads — and its `waitUntil` extends the function's life until the
 * given promise settles.
 *
 * The context is only reachable while the request's own async context is
 * active, so it is captured when the request's root span *starts* and used when
 * the span ends. Outside Vercel (local development, `next start`, tests) there is
 * no such context, nothing is captured, and the export simply runs.
 *
 * Unverified on a real deployment until the owner deploys with telemetry on
 * (runbook §12): the contract is Vercel's and is exercised here with a stand-in.
 */

const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

export type WaitUntil = (promise: Promise<unknown>) => void;

type RequestContext = { waitUntil?: unknown };
type RequestContextHolder = { get?: () => RequestContext | undefined };

/** The current request's `waitUntil`, or `undefined` when the platform does not provide one. Never throws. */
export function captureWaitUntil(): WaitUntil | undefined {
  try {
    const holder = (globalThis as Record<symbol, unknown>)[
      VERCEL_REQUEST_CONTEXT
    ] as RequestContextHolder | undefined;
    const context = holder?.get?.();
    const waitUntil = context?.waitUntil;
    if (typeof waitUntil !== "function") return undefined;
    return (promise) => {
      try {
        waitUntil.call(context, promise);
      } catch {
        // The export still runs; it is just not held open.
      }
    };
  } catch {
    return undefined;
  }
}
