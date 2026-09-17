import { logger } from "./logger";
import { runInTraceContext } from "./trace-context";

/**
 * The codebase's own structured-error classes (`lib/errors/*.ts`) — each
 * sets a distinct `.name` and a `.code` drawn from a fixed string-literal
 * union, per code-standards.md's "Error Handling". Thrown instances of
 * these represent *expected* business rejections (`REVIEW_NOT_DUE`,
 * `LESSON_ALREADY_ENROLLED`, ...) — spec 24's "Expected vs Unexpected
 * Errors" wants these logged at WARN with their code, not treated as a
 * production incident. Anything else (a raw `Error`, a database driver
 * error, a programming mistake) is unexpected and logged at ERROR with its
 * full stack.
 */
const DOMAIN_ERROR_NAMES = new Set([
  "AppError",
  "ReviewError",
  "LessonError",
  "DeckError",
  "AdminError",
  "LexiconError",
]);

function isExpectedDomainError(
  error: unknown,
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    DOMAIN_ERROR_NAMES.has(error.name) &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

export type WithTraceOptions = {
  /** Extra fields attached to every log line this operation emits. Safe identifiers only — never raw learner content (spec's Privacy Rules). */
  fields?: Record<string, unknown>;
  /**
   * Level for the started/succeeded pair. Defaults to "debug" ("operation
   * entered" is spec's own DEBUG example). Pass "info" for operations the
   * spec calls out as important — review completion, lesson completion,
   * Danger Zone actions, admin mutations, imports.
   */
  level?: "debug" | "info";
  /** Starts a genuinely new trace/request pair instead of inheriting an active one — see `runInTraceContext`. Used by request-boundary wrappers (route handlers, Server Actions), never by an ordinary nested domain call. */
  newTrace?: boolean;
  /** Only meaningful with `newTrace: true` — a real inbound request id, when the caller has one. */
  requestId?: string;
};

/**
 * Wraps `fn` as one traced operation (spec's "Operation Tracing" — the
 * `withTrace("reviews.completeReview", async () => {...})` helper).
 * Automatically records `<operation>.started`, `<operation>.succeeded` or
 * `<operation>.failed`, and duration, so callers never hand-roll the same
 * three log lines around every important function. Callers may still emit
 * their own finer-grained events from inside `fn` (e.g.
 * "review.transaction.committed") — those share this call's trace context
 * automatically.
 */
export async function withTrace<T>(
  operation: string,
  fn: () => Promise<T>,
  options: WithTraceOptions = {},
): Promise<T> {
  return runInTraceContext(
    operation,
    async () => {
      const level = options.level ?? "debug";
      const startedAt = Date.now();
      logger[level]({ event: `${operation}.started`, ...options.fields });

      try {
        const result = await fn();
        logger[level]({
          event: `${operation}.succeeded`,
          durationMs: Date.now() - startedAt,
          ...options.fields,
        });
        return result;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        if (isExpectedDomainError(error)) {
          logger.warn({
            event: `${operation}.failed`,
            durationMs,
            errorCode: error.code,
            ...options.fields,
          });
        } else {
          logger.error({
            event: `${operation}.failed`,
            durationMs,
            error,
            ...options.fields,
          });
        }
        throw error;
      }
    },
    { newTrace: options.newTrace, requestId: options.requestId },
  );
}
