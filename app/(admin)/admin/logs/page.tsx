import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LogsTabsNav } from "@/components/admin/logs/logs-tabs-nav";
import { AdminLogsListApp } from "@/components/admin/react-admin/logs/logs-list-app";
import { canUseDeveloperTools } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Logs — Polyglot Admin",
};

type SearchParams = { tab?: string };

/**
 * Audit/System logs route (spec 11 §46-§52). Available to both admin and
 * developer (spec 11 §4's "selected system logs where appropriate").
 *
 * The Audit tab is a React Admin list — **until PostHog replaces it** (the
 * owner's decision of 2026-10-14; spec 26 had kept this page as it was). This
 * page keeps the server-side guard and the tabs; the log itself, its filters and
 * its paging are fetched by the screen from `/api/v1/admin/logs`, which reads
 * every filter and the cursor from the real URL. The page's own `tab` parameter
 * is the only one it reads.
 */
export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!canUseDeveloperTools(user)) {
    forbidden();
  }

  const params = await searchParams;
  const tab = params.tab === "system" ? "system" : "audit";

  return (
    <div>
      <AdminPageHeader
        title="Logs"
        description="Administrative audit history and selected system diagnostics."
      />
      <LogsTabsNav active={tab} />
      {tab === "system" ? (
        <SystemLogsPanel />
      ) : (
        <AdminLogsListApp signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL} />
      )}
    </div>
  );
}

/**
 * No system-event logging pipeline exists anywhere in this codebase yet
 * (Sentry/PostHog wiring is tracked as "Not started" in progress-tracker.md's
 * Infrastructure Status) — building one is a genuinely separate, cross-
 * cutting feature (every error/rate-limit/failure call site across
 * `domains/lessons`, `domains/srs`, `providers/rate-limit`, etc. would need
 * a write hook into a new durable store), not something this pass invents
 * as a side effect of the Logs route. An honest placeholder here beats a
 * fabricated one.
 */
function SystemLogsPanel() {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        System log pipeline not yet wired up
      </p>
      <p className="mt-1">
        No structured system-event store exists yet (errors, warnings,
        curriculum/lesson/review failures, rate-limit events). This tab will
        populate once that pipeline exists — see progress-tracker.md&apos;s
        Infrastructure Status.
      </p>
    </div>
  );
}
