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
import { useAdminPermissions } from "../use-admin-permissions";
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
 * What each role gets follows the *server's* permissions, never a role name
 * held here: `canPublishCurriculum` (an Admin) additionally gets row selection
 * and the bulk commands it feeds (spec 26 Unit 7); a writer reads the list and
 * opens items, with no checkbox column. The endpoints refuse a writer's bulk
 * request regardless.
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
  const permissions = useAdminPermissions();

  const problem =
    blockingError(list.error, Boolean(list.rows)) ??
    blockingError(permissions.error, Boolean(permissions.permissions));

  const refreshFailed = list.isRefetchError && !problem;
  const refreshError = list.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  const canBulk = Boolean(permissions.permissions?.canPublishCurriculum);

  return (
    <ResourceContextProvider value="curriculum">
      <ListContextProvider value={list.listContext}>
        <CurriculumFilters
          languages={languages}
          levels={levels}
          groups={groups}
        />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : list.isPending || !permissions.permissions ? (
          <CurriculumListSkeleton withFilters={false} />
        ) : (
          <>
            <CurriculumDataTable
              levels={levels}
              groups={groups}
              canBulk={canBulk}
            />
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
