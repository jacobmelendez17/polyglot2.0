import { AsyncLocalStorage } from "node:async_hooks";

import type { PendingAnalyticsEvent } from "./analytics-events";

/**
 * Spec 27 Unit 27.3 — how a committed result becomes an analytics event
 * without the event ever being able to disagree with the result.
 *
 * A completion (a lesson, a review item) is decided inside a transaction that
 * may still be refused, rolled back, or — on a retry — not run at all because
 * its idempotency key already holds the stored result. An analytics event must
 * follow none of those. So the domain code does not send anything: it *queues*
 * an event into the scope the Server Action opened around the whole call, at the
 * one point that only runs for a first execution, and the action emits the
 * queue only after the call has returned:
 *
 * - the call throws or rolls back → the scope's result is never read, the queue
 *   is dropped, nothing is emitted;
 * - the call is an idempotent replay → the transactional callback never ran, so
 *   nothing was queued;
 * - the call returns → the transaction committed, and the action may emit.
 *
 * Outside a scope (a script, a test, a flow nobody instrumented) queueing is a
 * no-op, so instrumenting a domain function can never change what it does or
 * what its tests see. Same mechanism as `lib/logging/trace-context.ts`, and the
 * same rule: server code only — never import this into a `"use client"` file.
 */

/** A safety bound, not a feature: one call has no business queueing more. */
const MAX_EVENTS_PER_SCOPE = 20;

const storage = new AsyncLocalStorage<PendingAnalyticsEvent[]>();

/** Queues an event for the open collection scope. A no-op without one, and never throws — instrumentation must not be able to fail the work it describes. */
export function queueAnalyticsEvent(event: PendingAnalyticsEvent): void {
  try {
    const queue = storage.getStore();
    if (queue && queue.length < MAX_EVENTS_PER_SCOPE) queue.push(event);
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * Runs `work` in a fresh collection scope and returns what it returned plus
 * what it queued. If `work` throws, so does this, and nothing it queued is
 * handed out.
 */
export async function collectAnalyticsEvents<T>(
  work: () => Promise<T>,
): Promise<{ result: T; events: PendingAnalyticsEvent[] }> {
  const queue: PendingAnalyticsEvent[] = [];
  const result = await storage.run(queue, work);
  return { result, events: [...queue] };
}
