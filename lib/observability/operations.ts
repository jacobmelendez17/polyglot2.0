/**
 * Spec 27 Unit 27.5 — the application operations that become spans and
 * metrics, and what their outcomes are called.
 *
 * A closed table, not a pattern: an operation that is not listed is invisible
 * to telemetry, so a span name or a metric label can only ever be one of these
 * constants — never built from a request, a route, a user or an error message
 * (spec 27 §7.2–7.3). The keys are the names `withTrace` already uses for
 * Spec 24's logging, which is what makes a span and its log lines easy to find
 * together.
 */

export type OperationOutcome =
  /** The request was valid and processed, but committed nothing new (e.g. the first of an item's two answers). */
  | "accepted"
  /** New authoritative work was committed. */
  | "succeeded"
  /** An idempotent replay of work committed earlier: not a second success. */
  | "replayed"
  /** The domain refused it on purpose (stale, not due, already enrolled…) — a business answer, not an incident. */
  | "expected_rejected"
  /** Anything else that threw. */
  | "unexpected_failed";

export type MetricFamily = "review_submission" | "lesson_completion";

export type ObservedOperation = {
  /** The span's name: a constant, so a span can never be named after a request. */
  readonly span: string;
  /** The metric family fed by this operation's outcomes, if any. */
  readonly metric?: MetricFamily;
  /** What a call that returned (did not throw) is called, given whether it committed new work. */
  readonly resolved: (committed: boolean) => OperationOutcome;
};

export const OBSERVED_OPERATIONS: Readonly<Record<string, ObservedOperation>> =
  {
    // Every answer a learner submits, whether or not it completes the item.
    "reviews.submitAnswer": {
      span: "review.submission",
      metric: "review_submission",
      resolved: (committed) => (committed ? "succeeded" : "accepted"),
    },
    // The atomic item completion inside that submission (the database transaction).
    "review.transaction": {
      span: "review.commit",
      resolved: (committed) => (committed ? "succeeded" : "replayed"),
    },
    "lesson.transaction": {
      span: "lesson.completion",
      metric: "lesson_completion",
      resolved: (committed) => (committed ? "succeeded" : "replayed"),
    },
    // A daily batch, not a request: a span for its duration, no SLI.
    "account.delete.finalize": {
      span: "account.deletion.finalize",
      resolved: () => "succeeded",
    },
  };

export function findObservedOperation(
  operation: string,
): ObservedOperation | undefined {
  return Object.hasOwn(OBSERVED_OPERATIONS, operation)
    ? OBSERVED_OPERATIONS[operation]
    : undefined;
}

// Domain error codes are upper-snake constants from fixed unions
// (`lib/errors/*`). Anything that does not look like one is not trusted as a label.
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,59}$/;

export type FailureClassification = {
  outcome: "expected_rejected" | "unexpected_failed";
  /** A domain error code, `OTHER` for a code that is not a safe constant, or `UNEXPECTED`. Never an error message. */
  category: string;
};

export function classifyFailure(
  expected: { code: string } | null,
): FailureClassification {
  if (!expected)
    return { outcome: "unexpected_failed", category: "UNEXPECTED" };
  return {
    outcome: "expected_rejected",
    category: SAFE_ERROR_CODE.test(expected.code) ? expected.code : "OTHER",
  };
}
