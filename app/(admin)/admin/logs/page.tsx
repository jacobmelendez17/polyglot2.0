import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LogsTabsNav } from "@/components/admin/logs/logs-tabs-nav";
import { AdminLogsListApp } from "@/components/admin/react-admin/logs/logs-list-app";
import { buildSignalRows } from "@/components/admin/system/system-status";
import { SystemStatusPanel } from "@/components/admin/system/system-status-panel";
import { canUseDeveloperTools } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";
import { env, operationalLinks, telemetryConfig } from "@/lib/env";
import { summarizeTelemetryConfig } from "@/lib/telemetry-config";

export const metadata: Metadata = {
  title: "Logs — Polyglot Admin",
};

type SearchParams = { tab?: string };

/**
 * Audit/System logs route (spec 11 §46-§52). Available to both admin and
 * developer (spec 11 §4's "selected system logs where appropriate").
 *
 * The Audit tab is a React Admin list (since 2026-10-14). PostHog does not
 * replace it — spec 27 keeps audits in Neon (the owner's decision of 2026-10-17)
 * — so it stays. This page keeps the server-side guard and the tabs; the log
 * itself, its filters and its paging are fetched by the screen from
 * `/api/v1/admin/logs`, which reads every filter and the cursor from the real
 * URL. The page's own `tab` parameter is the only one it reads.
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
        description="Administrative audit history, and how this server sends telemetry."
      />
      <LogsTabsNav active={tab} />
      {tab === "system" ? (
        <SystemTab />
      ) : (
        <AdminLogsListApp signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL} />
      )}
    </div>
  );
}

/**
 * The System tab (spec 27 Unit 27.10): how this server is set up to send
 * telemetry, and links to the owner's own dashboards and alerts. It replaced a
 * placeholder that said no system-event pipeline existed; there is still no
 * in-app store of system events — Grafana is where those are read — so this tab
 * explains and links rather than listing events.
 *
 * Everything it shows comes from the sanitized telemetry summary (states and
 * issue codes only) and the validated link settings, so no credential can reach
 * the page. The Audit tab beside it is untouched.
 */
function SystemTab() {
  const traces = telemetryConfig.observability.traces;
  const signals = buildSignalRows(summarizeTelemetryConfig(telemetryConfig), {
    traceSampleRatio: traces.state === "enabled" ? traces.sampleRatio : null,
  });
  return <SystemStatusPanel signals={signals} links={operationalLinks} />;
}
