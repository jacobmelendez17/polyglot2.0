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
 *
 * Shared by the operation tracer (logging) and the operation telemetry bridge
 * (spec 27's metrics and spans), so both agree on what "expected" means.
 */
const DOMAIN_ERROR_NAMES = new Set([
  "AppError",
  "ReviewError",
  "LessonError",
  "DeckError",
  "AdminError",
  "LexiconError",
]);

export function isExpectedDomainError(
  error: unknown,
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    DOMAIN_ERROR_NAMES.has(error.name) &&
    typeof (error as { code?: unknown }).code === "string"
  );
}
