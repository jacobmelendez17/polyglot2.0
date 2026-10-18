import { context, SpanKind, trace } from "@opentelemetry/api";

import { logger } from "@/lib/logging/logger";
import {
  markOperationCommitted,
  observeOperation,
} from "@/lib/logging/operation-telemetry";

/**
 * Test support for the observability pipeline: plays one request the way
 * Next.js would — a root span carrying the raw URL, a child span of its own —
 * with a review submission inside it that commits, fails a step and logs an
 * error carrying every kind of thing that must never leave the process.
 *
 * Not imported by application code.
 */

/** Strings that must not appear anywhere in anything exported. */
export const SIMULATED_SECRET = "hunter2-glc_AbCdEfGhIjKlMnOpQrStUv";
export const SIMULATED_USER_ID = "11111111-2222-3333-4444-555555555555";
export const SIMULATED_EMAIL = "someone@example.com";

export const NEVER_EXPORTED = [
  SIMULATED_SECRET,
  "hunter2",
  SIMULATED_USER_ID,
  SIMULATED_EMAIL,
  "token=",
  "password",
  "SELECT * FROM users",
  "private journal entry",
];

export async function simulateHostileRequest(): Promise<void> {
  const root = trace.getTracer("next.js").startSpan("POST", {
    kind: SpanKind.SERVER,
    attributes: {
      "next.span_type": "BaseServer.handleRequest",
      "http.method": "POST",
      "http.target": `/reviews?token=${SIMULATED_SECRET}&u=${SIMULATED_EMAIL}`,
      "http.url": `https://example.com/reviews?token=${SIMULATED_SECRET}`,
    },
  });

  await context.with(trace.setSpan(context.active(), root), async () => {
    trace
      .getTracer("next.js")
      .startSpan("render route (app) /reviews", {
        attributes: { "next.span_type": "AppRender.getBodyResult" },
      })
      .end();

    await observeOperation("reviews.submitAnswer", async () => {
      markOperationCommitted();
      logger.error({
        event: "review.transaction.failed",
        errorCode: "STALE_REVIEW",
        userId: SIMULATED_USER_ID,
        email: SIMULATED_EMAIL,
        sql: "SELECT * FROM users WHERE email = 'someone@example.com'",
        journal: "my private journal entry",
        error: new Error(`password=${SIMULATED_SECRET}`),
      });
    });
  });

  root.setAttributes({ "http.status_code": 200, "next.route": "/reviews" });
  root.end();
}
