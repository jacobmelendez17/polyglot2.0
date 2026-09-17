/**
 * Spec 24's "central logger should provide a redaction mechanism for known
 * sensitive fields... safety should not depend entirely on every caller
 * remembering what is sensitive." This is a backstop, not the only
 * protection — callers must still never pass learner content (typed
 * answers, journal text, notes) into a log field in the first place; this
 * only catches field *names* that look like credentials/secrets.
 *
 * Matches by key name, not by value shape, so it works uniformly across
 * every domain's log fields without a maintained per-caller allowlist.
 *
 * Deliberately does *not* match bare "session" — the spec explicitly lists
 * `review_session_id`/`lesson_session_id` as safe optional identifiers, and
 * this codebase's own `sessionId` fields (e.g. `ReviewState.sessionId`) are
 * business identifiers, not auth credentials (Clerk owns the actual session
 * token/cookie, which this pattern still catches via "token"/"cookie").
 */
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|authoriz|cookie|api[-_]?key|database[-_]?url|connection[-_]?string/i;

const REDACTED_PLACEHOLDER = "[REDACTED]";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Deep-clones `value`, replacing any object property whose key matches a
 * known-sensitive pattern with a fixed placeholder. Non-plain-object values
 * (primitives, `Date`, etc.) pass through unchanged; arrays are walked
 * element-wise; circular references are broken rather than infinitely
 * recursed.
 */
export function redact<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return "[CIRCULAR]" as unknown as T;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    result[key] = isSensitiveKey(key)
      ? REDACTED_PLACEHOLDER
      : redact(entryValue, seen);
  }
  return result as T;
}
