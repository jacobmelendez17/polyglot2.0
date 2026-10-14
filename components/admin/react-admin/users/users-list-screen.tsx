"use client";

import { useEffect, useState } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";
import Typography from "@mui/material/Typography";

import type { AdminUserRow } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { CursorPagination } from "../cursor-pagination";
import { ListSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { ChangeRoleDialog } from "./change-role-dialog";
import { ROLE_LABELS, personLabel } from "./role-model";
import { UsersDataTable } from "./users-data-table";
import { UsersListFilters } from "./users-list-filters";
import { useUsersList } from "./use-users-list";

/**
 * `/admin/users`, on React Admin (spec 26 Unit 6): the real accounts, newest
 * first, with a search and Previous/Next, and a **Change role** action on every
 * row but your own.
 *
 * Who may do what follows the *server's* permissions, never a role name held
 * here: the page is Admin-only (its guard, and the endpoint's, are
 * `canManageUsers` from the database role), and the `edit` action on the
 * `users` resource gets the buttons. If that is revoked while the page is open
 * the next request is a 403 and a denial replaces the rows; nothing cached
 * outlives the server's answer.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (told apart from "no match", with a way out), error (in place, a retry only
 * when one could help), forbidden. A denial always replaces whatever rows are
 * still cached; a transient failure keeps them with a warning.
 */
export function UsersListScreen({ currentUserId }: { currentUserId: string }) {
  const notify = useNotify();
  const list = useUsersList();
  const permissions = useAdminPermissions();
  const [changing, setChanging] = useState<AdminUserRow | null>(null);

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

  const canChangeRole = Boolean(
    permissions.permissions?.resources.users?.includes("edit"),
  );
  const search = list.state.filters.search;

  return (
    <ResourceContextProvider value="users">
      <ListContextProvider value={list.listContext}>
        <UsersListFilters />

        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : list.isPending || !permissions.permissions ? (
          <ListSkeleton label="Loading the users…" rows={5} />
        ) : (
          <>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mb: 1.5 }}
            >
              A role change takes effect on that person&apos;s next request. You
              can&apos;t change your own role.
            </Typography>
            <UsersDataTable
              currentUserId={currentUserId}
              canChangeRole={canChangeRole}
              onChangeRole={setChanging}
              search={search}
              onClearSearch={() => list.listContext.setFilters({}, {})}
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

        {changing ? (
          <ChangeRoleDialog
            user={changing}
            onClose={() => setChanging(null)}
            onChanged={(result) => {
              notify(
                `${personLabel(changing)} is now ${ROLE_LABELS[result.role]}.`,
                { type: "success" },
              );
              setChanging(null);
            }}
            onStale={() => void list.refetch()}
          />
        ) : null}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
