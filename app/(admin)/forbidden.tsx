import Link from "next/link";

/**
 * Rendered when `forbidden()` fires anywhere under `/admin` — a normal
 * user, or a developer hitting a curriculum-management route (spec 11 §5's
 * structured `FORBIDDEN` error, given a real page rather than a raw error).
 * `next.config.ts`'s `experimental.authInterrupts` is required for
 * `forbidden()`/this file to take effect (Next.js 16).
 *
 * Lives at the `(admin)` route-group level, one level above
 * `admin/layout.tsx`, not alongside it: a segment's error/forbidden
 * boundary wraps that segment's `page.js` and nested layouts, but never
 * the segment's own `layout.js` (confirmed against
 * `node_modules/next/dist/docs/.../error.md`, which documents the same
 * rule for `error.js` — `forbidden.js` uses the same boundary mechanism).
 * Since `admin/layout.tsx` is exactly where `forbidden()` is called for
 * the area-wide `canAccessAdminArea` check, the boundary has to sit one
 * level higher to catch it. Discovered by a real, direct-browser Playwright
 * check that kept returning Next's generic "This page could not be
 * accessed." fallback for a normal/developer-only user visiting `/admin`
 * instead of this file's content, even though the HTTP status was already
 * a correct 403.
 */
export default function AdminForbidden() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">You don&apos;t have access to this page</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This area of Polyglot is restricted to authorized administrative accounts.
      </p>
      <Link href="/dashboard" className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
        Return to dashboard
      </Link>
    </div>
  );
}
