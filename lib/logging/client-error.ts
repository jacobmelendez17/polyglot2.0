/**
 * Spec 24's "Browser / Client Errors" / "Sentry Integration Boundary":
 * client-side errors (React error boundaries, unhandled rejections) should
 * eventually feed the centralized observability system, but "during
 * production, serious browser errors should be sent through the approved
 * monitoring/error provider" — Sentry — "rather than relying on the user's
 * browser console."
 *
 * Sentry is not installed in this codebase yet (progress-tracker.md's
 * Infrastructure Status: "Sentry and PostHog wiring — Not started"), so this
 * is deliberately a thin, honest stub rather than a fabricated integration:
 * readable console output in development, a documented no-op in
 * production/preview. This is the single call site every client error
 * boundary should use — wiring the real Sentry SDK later means editing this
 * one function, not every `error.tsx` in the app.
 *
 * Kept entirely separate from `lib/logging/logger.ts`: that module targets
 * server-side structured output and must never be imported into a "use
 * client" file (bundling `node:async_hooks`-based tracing into the browser
 * would be both wrong and broken).
 */
export function reportClientError(
  error: Error & { digest?: string },
  context?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(error, context);
    return;
  }
  // Extension point for the real Sentry SDK once it's wired (spec 24's
  // Sentry Integration Boundary). Intentionally silent until then — the
  // user-facing error UI already communicates the failure; this only feeds
  // the (currently nonexistent) monitoring pipeline.
}
