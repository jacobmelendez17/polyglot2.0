import { normalizeMethod } from "./request-labels";

/**
 * Spec 27 Unit 27.6 — what of a log line may leave the process.
 *
 * Grafana receives a *projection* of Spec 24's structured log lines, not the
 * line and not stdout (spec 27 §8). The projection is positive: it starts empty
 * and adds only the attributes named in `LOG_ATTRIBUTES`, each through a
 * validator that accepts a value only if it has the expected *shape* — an
 * enumerated word, a bounded integer, a UUID, a constant-style code. The
 * validators are the privacy contract. The existing key-name redactor
 * (`lib/logging/redact.ts`) has already run on the line, but this does not rely
 * on it: a secret under an innocent key name, a message, a stack trace, a user
 * id, an email, SQL or a learner's text simply has no attribute to go in, and
 * a value that fails its validator is dropped rather than trimmed or masked.
 *
 * `sanitizeLogAttributes` applies the same table again to whatever reaches the
 * exporter (`providers/observability/exporters.ts`), so even a record produced
 * some other way cannot carry more than this file allows.
 *
 * Pure functions, no I/O.
 */

export type LogLevelName = "debug" | "info" | "warn" | "error" | "fatal";

/** OpenTelemetry's SeverityNumber values for the five levels Spec 24 uses. */
export const SEVERITY_NUMBERS: Readonly<Record<LogLevelName, number>> = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

const LEVEL_ORDER: Readonly<Record<LogLevelName, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Only warnings and worse are exported. Spec 24's INFO lines describe every
 * successful request, and sending them would spend Vercel Hobby CPU on the
 * normal case for no diagnostic gain: what an operator needs in Grafana is what
 * went wrong, found by the request id its span shares.
 */
export const LOG_EXPORT_MIN_LEVEL: LogLevelName = "warn";

export type LogAttributeValue = string | number | boolean;
type Validator = (value: unknown) => LogAttributeValue | undefined;

const text =
  (pattern: RegExp, maxLength: number): Validator =>
  (value) =>
    typeof value === "string" &&
    value.length <= maxLength &&
    pattern.test(value)
      ? value
      : undefined;

const integer =
  (min: number, max: number): Validator =>
  (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
      ? value
      : undefined;

const decimal =
  (min: number, max: number): Validator =>
  (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
      ? Math.round(value * 1000) / 1000
      : undefined;

// `review.transaction.failed`, `analytics.posthog.send_failed`.
const EVENT_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+){0,7}$/;
// `reviews.submitAnswer`, `route.finalizeAccountDeletions`, `admin.levels.list`.
const OPERATION_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const SNAKE_WORD = /^[a-z][a-z0-9_-]*$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,59}$/;
const CLASS_NAME = /^[A-Za-z][A-Za-z0-9_$]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Vercel's own request id: `iad1::abcde-1710000000000-0123456789ab`.
const VERCEL_REQUEST_ID =
  /^[a-z0-9]{2,8}::(?:[a-z0-9]{2,8}::)?[a-z0-9]{2,8}-\d{13}-[a-f0-9]{12}$/;
const OUTCOMES: ReadonlySet<string> = new Set([
  "accepted",
  "succeeded",
  "replayed",
  "expected_rejected",
  "unexpected_failed",
]);

const method: Validator = (value) => {
  const normalized = normalizeMethod(value);
  return normalized === "OTHER" ? undefined : normalized;
};

/** The only attributes a log record may carry, and what each may hold. */
export const LOG_ATTRIBUTES: Readonly<Record<string, Validator>> = {
  "event.name": text(EVENT_NAME, 100),
  "polyglot.operation": text(OPERATION_NAME, 80),
  "polyglot.route": text(OPERATION_NAME, 80),
  "http.request.method": method,
  "polyglot.status": integer(100, 599),
  "polyglot.outcome": (value) =>
    typeof value === "string" && OUTCOMES.has(value) ? value : undefined,
  "polyglot.result": text(SNAKE_WORD, 30),
  "polyglot.reason": text(SNAKE_WORD, 40),
  "polyglot.error_code": text(ERROR_CODE, 60),
  "exception.type": text(CLASS_NAME, 60),
  "polyglot.duration_ms": decimal(0, 86_400_000),
  "polyglot.provider": text(SNAKE_WORD, 30),
  "polyglot.signal": text(SNAKE_WORD, 30),
  "polyglot.dropped": integer(0, 1_000_000),
  "polyglot.trace_id": text(UUID, 36),
  "polyglot.request_id": (value) =>
    typeof value === "string" &&
    value.length <= 64 &&
    (UUID.test(value) || VERCEL_REQUEST_ID.test(value))
      ? value
      : undefined,
};

function own(source: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

/** Keeps only the allowlisted attributes of `raw`, each only if its value has the right shape. */
export function sanitizeLogAttributes(
  raw: Record<string, unknown>,
): Record<string, LogAttributeValue> {
  const attributes: Record<string, LogAttributeValue> = {};
  for (const [name, validate] of Object.entries(LOG_ATTRIBUTES)) {
    const checked = validate(own(raw, name));
    if (checked !== undefined) attributes[name] = checked;
  }
  return attributes;
}

/** The body of a record: its event name when that is a plain dotted constant, otherwise a fixed word. */
export function sanitizeLogBody(body: unknown): string {
  return text(EVENT_NAME, 100)(body) === undefined ? "log" : (body as string);
}

export type ProjectedLogRecord = {
  severityNumber: number;
  severityText: string;
  body: string;
  attributes: Record<string, LogAttributeValue>;
};

/**
 * The exportable form of one Spec 24 log line, or `null` when it is below the
 * export level. `payload` is the object the logger built (timestamp, level,
 * `event`, the caller's fields, and a serialised `error`).
 */
export function projectLogRecord(
  level: LogLevelName,
  payload: Record<string, unknown>,
): ProjectedLogRecord | null {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[LOG_EXPORT_MIN_LEVEL]) return null;

  const error = own(payload, "error");
  const errorFields =
    error !== null && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};

  const attributes = sanitizeLogAttributes({
    "event.name": own(payload, "event"),
    "polyglot.operation": own(payload, "operation"),
    "polyglot.route": own(payload, "route"),
    "http.request.method": own(payload, "method"),
    "polyglot.status": own(payload, "status"),
    "polyglot.outcome": own(payload, "outcome"),
    "polyglot.result": own(payload, "result"),
    "polyglot.reason": own(payload, "reason"),
    // A domain error's code: on the line itself (`withTrace` puts it there for
    // an expected failure) or on the serialised error.
    "polyglot.error_code":
      own(payload, "errorCode") ?? own(errorFields, "errorCode"),
    "exception.type": own(errorFields, "name"),
    "polyglot.duration_ms": own(payload, "durationMs"),
    "polyglot.provider": own(payload, "provider"),
    "polyglot.signal": own(payload, "signal"),
    "polyglot.dropped": own(payload, "dropped"),
    "polyglot.trace_id": own(payload, "traceId"),
    "polyglot.request_id": own(payload, "requestId"),
  });

  return {
    severityNumber: SEVERITY_NUMBERS[level],
    severityText: level.toUpperCase(),
    body: sanitizeLogBody(own(payload, "event")),
    attributes,
  };
}
