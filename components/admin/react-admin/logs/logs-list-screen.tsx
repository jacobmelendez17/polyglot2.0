"use client";

import { useEffect } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { CursorPagination } from "../cursor-pagination";
import { ListSkeleton } from "../skeletons";
import { LogsDataTable } from "./logs-data-table";
import { LogsFilters } from "./logs-filters";
import { useLogsList } from "./use-logs-list";

/**
 * The audit log on React Admin: `/admin/logs`'s Audit tab — who changed what,
 * newest first, with the page's filters and the recorded before and after one
 * click away. It stands in for the structured logging PostHog is meant to
 * replace (the owner's decision of 2026-10-14), and is read-only: there is
 * nothing here to change, so no command and no permission lookup — the endpoint
 * says who may read it (Admin and developer, never a writer) with a 403, which
 * shows here as access-denied rather than an empty list.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (designed, told apart from "past the end" and from "nothing matches"), error
 * (in place, a retry only when one could help), and forbidden. A denial always
 * replaces whatever rows are still cached; a transient failure keeps them with a
 * warning.
 */
export function LogsListScreen() {
  const notify = useNotify();
  const list = useLogsList();

  const problem = blockingError(list.error, Boolean(list.rows));

  const refreshFailed = list.isRefetchError && !problem;
  const refreshError = list.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  return (
    <ResourceContextProvider value="logs">
      <ListContextProvider value={list.listContext}>
        <LogsFilters />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
            }}
          />
        ) : list.isPending ? (
          <ListSkeleton label="Loading the audit log…" rows={6} />
        ) : (
          <>
            <LogsDataTable />
            <CursorPagination
              hasPreviousPage={list.pagination.hasPreviousPage}
              hasNextPage={list.pagination.hasNextPage}
              locked={list.pagination.locked}
              onPrevious={list.pagination.goToPreviousPage}
              onNext={list.pagination.goToNextPage}
            />
          </>
        )}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
