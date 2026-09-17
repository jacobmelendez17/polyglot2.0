"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { AdminAuditEvent } from "@/domains/admin";

type AuditLogTableProps = {
  events: AdminAuditEvent[];
  actorNamesById: Record<string, string>;
};

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

/** Spec 11 rewrite's Audit Logs table — every row's before/after metadata is available on demand (one expanded row at a time) rather than always rendered, keeping the default view scannable. */
export function AuditLogTable({ events, actorNamesById }: AuditLogTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No audit events match these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Resource</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((event) => {
            const isExpanded = expandedId === event.id;
            const hasDetail =
              event.beforeData !== null || event.afterData !== null;
            return (
              <Fragment key={event.id}>
                <tr className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatTimestamp(event.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {actorNamesById[event.actorUserId] ??
                      `${event.actorUserId.slice(0, 8)}…`}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {event.action}
                  </td>
                  <td className="px-3 py-2">
                    {event.resourceType}
                    {event.resourceId ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {event.resourceId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {event.reason ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {hasDetail ? (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded ? "Hide details" : "Show details"
                        }
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : event.id)
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : null}
                  </td>
                </tr>
                {isExpanded ? (
                  <tr>
                    <td colSpan={6} className="bg-muted/30 px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Before
                          </p>
                          <pre className="overflow-x-auto rounded-md bg-card p-2 text-xs">
                            {JSON.stringify(event.beforeData, null, 2) ??
                              "null"}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            After
                          </p>
                          <pre className="overflow-x-auto rounded-md bg-card p-2 text-xs">
                            {JSON.stringify(event.afterData, null, 2) ?? "null"}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
