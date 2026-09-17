import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Spec 24 (Structured Logging & Request Tracing) — request-scoped trace
 * context. `AsyncLocalStorage` is Node's supported mechanism for carrying
 * per-request state across `await` boundaries without threading it through
 * every function argument, and — unlike a module-level mutable variable —
 * it never leaks between concurrent requests: each call to `storage.run`
 * gets its own isolated store that follows only that call's async
 * continuation.
 */
export type TraceContext = {
  /** Identifies the larger logical operation. Stable across every nested operation started while this context is active. */
  traceId: string;
  /** Identifies the actual inbound request. Equal to `traceId` unless a caller (e.g. a route handler) supplies a real one. */
  requestId: string;
  /** The logical operation currently executing — e.g. "reviews.completeReview". Updated per nested `enterOperation`/`withTrace` call; `traceId`/`requestId` are not. */
  operation: string;
};

const storage = new AsyncLocalStorage<TraceContext>();

/** The active trace context, or `undefined` outside any traced operation (e.g. a script run directly, or a test that never entered one). */
export function getTraceContext(): TraceContext | undefined {
  return storage.getStore();
}

export function generateTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Enters `operation`, running `fn` inside the resulting trace context.
 *
 * - If a trace context is already active (a nested operation), `traceId`/
 *   `requestId` are inherited unchanged and only `operation` is updated —
 *   this is what keeps every log line for one logical request under the
 *   same `trace_id` (spec's "nested operations keep the same trace ID").
 * - Otherwise (the outermost boundary — a route handler, Server Action,
 *   cron job, or a script/test calling a traced function directly), a fresh
 *   `traceId` is generated. `requestId` defaults to the same value ("often
 *   they may initially be the same," per spec) unless `options.requestId`
 *   supplies a real inbound request id.
 * - `options.newTrace` forces a fresh `traceId`/`requestId` pair even if a
 *   context is already active — used by request-boundary wrappers
 *   (`withRouteTrace`) that must never inherit a caller's trace by accident.
 */
export function runInTraceContext<T>(
  operation: string,
  fn: () => T,
  options: { requestId?: string; newTrace?: boolean } = {},
): T {
  const current = getTraceContext();
  if (current && !options.newTrace) {
    return storage.run({ ...current, operation }, fn);
  }
  const traceId = generateTraceId();
  return storage.run(
    { traceId, requestId: options.requestId ?? traceId, operation },
    fn,
  );
}
