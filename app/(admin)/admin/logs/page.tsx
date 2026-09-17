import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurriculumPagination } from "@/components/admin/curriculum/curriculum-pagination";
import { AuditLogFilters } from "@/components/admin/logs/audit-log-filters";
import { AuditLogTable } from "@/components/admin/logs/audit-log-table";
import { LogsTabsNav } from "@/components/admin/logs/logs-tabs-nav";
import {
  ADMIN_AUDIT_ACTIONS,
  canUseDeveloperTools,
  type AdminAuditAction,
} from "@/domains/admin";
import { getAuditEvents } from "@/domains/admin/server";
import { getUsersByIds, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Logs — Polyglot Admin",
};

const PAGE_SIZE = 25;

type SearchParams = {
  tab?: string;
  actor?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

function displayNameFor(user: {
  id: string;
  displayName: string | null;
  clerkUserId: string | null;
}): string {
  return user.displayName ?? user.clerkUserId ?? `${user.id.slice(0, 8)}…`;
}

/**
 * Audit/System logs route (spec 11 §46-§52). Available to both admin and
 * developer (spec 11 §4's "selected system logs where appropriate").
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
        <AuditLogsPanel params={params} />
      )}
    </div>
  );
}

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function AuditLogsPanel({ params }: { params: SearchParams }) {
  const action = ADMIN_AUDIT_ACTIONS.includes(params.action as AdminAuditAction)
    ? (params.action as AdminAuditAction)
    : undefined;
  // A malformed actor ID would otherwise reach getAuditEvents's Zod
  // boundary and throw an uncaught error for what's just a filter typo on
  // a read-only page (no runAdminAction-style try/catch exists here since
  // nothing is mutated) — drop it silently instead, same as an unrecognized
  // `action` value above.
  const actorUserId =
    params.actor && UUID_LIKE.test(params.actor) ? params.actor : undefined;
  const from = params.from
    ? new Date(`${params.from}T00:00:00.000Z`)
    : undefined;
  const to = params.to ? new Date(`${params.to}T23:59:59.999Z`) : undefined;

  const page = await getAuditEvents({
    actorUserId,
    action,
    resourceType: params.resourceType || undefined,
    resourceId: params.resourceId || undefined,
    from,
    to,
    limit: PAGE_SIZE,
    cursor: params.cursor,
  });

  const actorIds = [...new Set(page.items.map((event) => event.actorUserId))];
  const actors = await getUsersByIds(actorIds);
  const actorNamesById = Object.fromEntries(
    actors.map((actor) => [actor.id, displayNameFor(actor)]),
  );

  const nextParams = new URLSearchParams();
  nextParams.set("tab", "audit");
  if (params.actor) nextParams.set("actor", params.actor);
  if (action) nextParams.set("action", action);
  if (params.resourceType) nextParams.set("resourceType", params.resourceType);
  if (params.resourceId) nextParams.set("resourceId", params.resourceId);
  if (params.from) nextParams.set("from", params.from);
  if (params.to) nextParams.set("to", params.to);
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  return (
    <div>
      <AuditLogFilters
        value={{
          actorUserId: params.actor,
          action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          from: params.from,
          to: params.to,
        }}
      />
      <AuditLogTable events={page.items} actorNamesById={actorNamesById} />
      {page.nextCursor ? (
        <CurriculumPagination
          nextHref={`/admin/logs?${nextParams.toString()}`}
        />
      ) : null}
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
