"use client";

import { useEffect, useMemo } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { CursorPagination } from "../cursor-pagination";
import { CurriculumDataTable } from "./curriculum-data-table";
import {
  CurriculumFilters,
  type CurriculumFilterLookups,
} from "./curriculum-filters";
import { CurriculumListSkeleton } from "./curriculum-list-skeleton";
import { useCurriculumList } from "./use-curriculum-list";

/**
 * `/admin/curriculum`'s list, on React Admin (spec 26 Unit 2). Filters, table,
 * selection, and pagination are React Admin's; where the list's *state* lives
 * (the page's URL) and how it pages (the server's cursors) is
 * `useCurriculumList`.
 *
 * The lookups (languages, levels, groups) arrive as props from the server
 * page, which already loads them; they only populate the filter dropdowns and
 * validate what the URL asks for.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table),
 * empty (told apart from "no match", with a next step), error (in place, with
 * a retry only when one could help), and forbidden — and a denial always
 * replaces whatever privileged rows are still cached, while a transient
 * failure keeps them with a warning.
 */
export function CurriculumListScreen({
  languages,
  levels,
  groups,
}: CurriculumFilterLookups) {
  const notify = useNotify();
  const lookups = useMemo(
    () => ({ languages, levels, groups }),
    [languages, levels, groups],
  );
  const list = useCurriculumList(lookups);

  const problem = blockingError(list.error, Boolean(list.rows));

  const refreshFailed = list.isRefetchError && !problem;
  const refreshError = list.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  return (
    <ResourceContextProvider value="curriculum">
      <ListContextProvider value={list.listContext}>
        <CurriculumFilters
          languages={languages}
          levels={levels}
          groups={groups}
        />
        {problem ? (
          <AdminProblem error={problem} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <CurriculumListSkeleton withFilters={false} />
        ) : (
          <>
            <CurriculumDataTable levels={levels} groups={groups} />
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
