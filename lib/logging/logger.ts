import { env } from "@/lib/env";

import { redact } from "./redact";
import { getTraceContext } from "./trace-context";

/**
 * Spec 24's central structured logger. Every log line carries the standard
 * fields (`timestamp`, `level`, `environment`, `release`, `service`) plus
 * whatever the active trace context has (`traceId`, `requestId`,
 * `operation`), so a single `trace_id` search reconstructs one request's
 * entire path (spec's "Recommended Trace Example").
 *
 * Development output is a single readable line; production/preview output
 * is one JSON object per line, suitable for Vercel's log pipeline. This is
 * the one module in the codebase allowed to call `console.*` directly —
 * code-standards.md's "avoid console.log in committed production code"
 * exists precisely so every other call site goes through here instead.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

function resolveMinimumLevel(): LogLevel {
  return env.LOG_LEVEL ?? (env.APP_ENV === "development" ? "debug" : "info");
}

/**
 * Every log call must name the event it describes (spec's
 * "reviews.completeReview" / "review.complete.started" style —
 * dot-namespaced, never a bare sentence like "here" or "it worked").
 * Additional fields are arbitrary structured metadata: safe identifiers,
 * durations, error codes — never raw learner content or credentials (the
 * redaction pass below is a backstop, not a substitute for that discipline).
 */
export type LogFields = Record<string, unknown> & {
  event: string;
  /** An unexpected exception to serialize (name, message, stack, cause, and — when present — a structured `errorCode`). Never pass a raw string; throw/catch a real `Error` upstream instead. */
  error?: unknown;
};

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const code = (error as { code?: unknown }).code;
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (typeof code === "string") serialized.errorCode = code;
  if (error.cause !== undefined) {
    serialized.cause =
      error.cause instanceof Error ? serializeError(error.cause) : error.cause;
  }
  return serialized;
}

function formatForDevelopment(
  level: LogLevel,
  payload: Record<string, unknown>,
): string {
  const { timestamp, event, operation, traceId, ...rest } = payload;
  const head = `[${String(timestamp)}] ${level.toUpperCase()} ${String(event)}`;
  const context = [
    operation ? `operation=${String(operation)}` : null,
    traceId ? `trace=${String(traceId).slice(0, 8)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const extraKeys = Object.keys(rest).filter((key) => rest[key] !== undefined);
  const extra =
    extraKeys.length > 0
      ? JSON.stringify(
          Object.fromEntries(extraKeys.map((key) => [key, rest[key]])),
        )
      : "";
  return [head, context, extra].filter(Boolean).join(" ");
}

function emit(level: LogLevel, fields: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[resolveMinimumLevel()]) return;

  const { error, ...rest } = fields;
  const trace = getTraceContext();

  const payload = redact({
    timestamp: new Date().toISOString(),
    level,
    environment: env.APP_ENV,
    release: env.RELEASE,
    service: "polyglot",
    traceId: trace?.traceId,
    requestId: trace?.requestId,
    operation: trace?.operation,
    ...rest,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  }) as Record<string, unknown>;

  const line =
    env.APP_ENV === "development"
      ? formatForDevelopment(level, payload)
      : JSON.stringify(payload);

  const consoleMethod =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;
  consoleMethod(line);
}

export const logger = {
  debug: (fields: LogFields): void => emit("debug", fields),
  info: (fields: LogFields): void => emit("info", fields),
  warn: (fields: LogFields): void => emit("warn", fields),
  error: (fields: LogFields): void => emit("error", fields),
  fatal: (fields: LogFields): void => emit("fatal", fields),
};
