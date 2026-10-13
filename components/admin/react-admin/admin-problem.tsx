"use client";

import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

import { describeAdminError } from "./admin-api-error";

/**
 * The in-place failure panel every migrated Admin screen shares (ui-context.md
 * "Interface States": errors appear in the region that failed, say what
 * happened, and offer a retry only when a retry could help):
 *
 * - **401** -> a brief hand-off message while the auth provider sends the
 *   browser to Clerk's sign-in.
 * - **403** -> permanent: a route out (the dashboard), never a retry.
 * - anything else -> a safe message plus "Try again" when retryable.
 *
 * Messages come from `describeAdminError`, never from the server's own text.
 */
export function AdminProblem({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { kind, message, retryable } = describeAdminError(error);

  if (kind === "unauthenticated") {
    // The auth provider has already sent the browser to Clerk's sign-in
    // page; this is only what shows during that hand-off.
    return (
      <Alert severity="info" role="status">
        {message}
      </Alert>
    );
  }

  if (kind === "forbidden") {
    // Permanent: offer a way out rather than a retry (ui-context.md Error).
    return (
      <Alert
        severity="warning"
        action={
          <Button
            color="inherit"
            size="small"
            component={NextLink}
            href="/dashboard"
          >
            Back to dashboard
          </Button>
        }
      >
        {message}
      </Alert>
    );
  }

  return (
    <Alert
      severity="error"
      action={
        retryable ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}

/**
 * The failure, if any, that must replace the screen. A transient failure
 * (network, 5xx) leaves already-loaded data in place so the person can keep
 * reading while a warning shows. A *denial* never does: if the server now
 * says 401/403, whatever privileged data is still in the cache must go
 * (spec 26 §8: "on 401/403 clear stale privileged UI").
 */
export function blockingError(error: unknown, hasData: boolean): unknown {
  if (!error) return null;
  const { kind } = describeAdminError(error);
  const isDenial = kind === "forbidden" || kind === "unauthenticated";
  return !hasData || isDenial ? error : null;
}
