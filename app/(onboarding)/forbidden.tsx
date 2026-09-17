import Link from "next/link";

/**
 * Rendered when `forbidden()` fires under `/onboarding` — in practice, a
 * non-admin account requesting the Sandbox's `?replay=1` preview (spec 15).
 * Without this file Next.js falls back to its own generic, unstyled 403 page.
 *
 * Placed at the `(onboarding)` route-group level rather than beside the page,
 * matching `app/(admin)/forbidden.tsx` and for the same reason documented
 * there: a segment's boundary wraps that segment's page and nested layouts
 * but never its own layout, so sitting one level higher catches every case.
 *
 * `next.config.ts`'s `experimental.authInterrupts` is what makes
 * `forbidden()` and this file take effect at all (Next.js 16).
 */
export default function OnboardingForbidden() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        You don&apos;t have access to this page
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Replaying onboarding is an administrative tool. Your own onboarding is
        available from the start of your account.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Return to dashboard
      </Link>
    </div>
  );
}
