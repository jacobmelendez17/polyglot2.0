"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { GROUP_LIST_MAX } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { ListSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { CreateGroupDialog } from "./create-group-dialog";
import { reorderHref } from "./group-list-params";
import { GroupsDataTable } from "./groups-data-table";
import { GroupsNoLevels } from "./groups-list-empty";
import { GroupsListFilters } from "./groups-list-filters";
import { useGroupsList } from "./use-groups-list";

/**
 * `/admin/curriculum/groups`, on React Admin (spec 26 Unit 5): one level's
 * vocabulary groups in lesson order, each linking to its page, with an "Add
 * group" command and the way into the specialist reorder tool for those allowed
 * to use them.
 *
 * Groups are always read **one level at a time** (see `GroupsListFilters`): a
 * group's position is its lesson number within its level. The URL carries the
 * language and level, so a view is bookmarkable and the links to and from a
 * group's page and the reorder tool return to exactly it.
 *
 * What each role sees follows the *server's* permissions, never a role name
 * held here: `canManageCurriculum` gets the list at all (the endpoint says so
 * with a 403 otherwise), and the `create`/`edit` actions on the `groups`
 * resource — which are the Admin-only structural permission — get the buttons.
 * A writer therefore sees every group and no way to add, edit or reorder one,
 * and the endpoints would refuse them anyway.
 *
 * Ordering is not done here. The reorder tool is a specialist screen that
 * stays as it was, and this list never offers a sort, so there is no generic
 * way to rewrite a `position` from a table (spec 26 Unit 5).
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (an invitation, or a pointer to whose job it is), error (in place, a retry
 * only when one could help), forbidden. A denial always replaces whatever rows
 * are still cached; a transient failure keeps them with a warning.
 */
export function GroupsListScreen({
  languages,
  levels,
}: {
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
}) {
  const notify = useNotify();
  const lookups = useMemo(() => ({ languages, levels }), [languages, levels]);
  const list = useGroupsList(lookups);
  const permissions = useAdminPermissions();
  const [adding, setAdding] = useState(false);

  const { filters } = list.state;
  const hasLevel = filters.level !== "";
  const levelNumber = levels.find(
    (level) => level.id === filters.level,
  )?.levelNumber;

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

  const groupActions = permissions.permissions?.resources.groups;
  const canCreate = hasLevel && Boolean(groupActions?.includes("create"));
  // Reordering one group is a no-op, so the way in is offered only when there
  // is something to put in order.
  const canReorder =
    hasLevel &&
    Boolean(groupActions?.includes("edit")) &&
    (list.rows?.length ?? 0) >= 2;
  const truncated = Boolean(
    (list.listContext.meta as { truncated?: boolean } | undefined)?.truncated,
  );

  return (
    <ResourceContextProvider value="groups">
      <ListContextProvider value={list.listContext}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            mb: 2,
          }}
        >
          <GroupsListFilters languages={languages} levels={levels} />
          <Box sx={{ ml: "auto", display: "flex", flexWrap: "wrap", gap: 1 }}>
            {canReorder ? (
              <Button
                variant="outlined"
                component={NextLink}
                href={reorderHref(filters)}
              >
                Reorder groups
              </Button>
            ) : null}
            {canCreate ? (
              <Button variant="contained" onClick={() => setAdding(true)}>
                Add group
              </Button>
            ) : null}
          </Box>
        </Box>

        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : !permissions.permissions ? (
          <ListSkeleton label="Loading the groups…" rows={4} />
        ) : !hasLevel ? (
          <GroupsNoLevels
            levelsHref={`/admin/curriculum/levels?language=${encodeURIComponent(filters.language)}`}
          />
        ) : list.isPending ? (
          <ListSkeleton label="Loading the groups…" rows={4} />
        ) : (
          <>
            {!canCreate ? (
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mb: 1.5 }}
              >
                You can see every group. An Admin adds and edits them.
              </Typography>
            ) : null}
            {truncated ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Showing the first {GROUP_LIST_MAX} groups.
              </Alert>
            ) : null}
            <GroupsDataTable
              levelNumber={levelNumber}
              canCreate={canCreate}
              onCreate={() => setAdding(true)}
            />
          </>
        )}

        {adding && hasLevel ? (
          <CreateGroupDialog
            // Opening it again is a new intent: it remounts, with nothing typed
            // and no stale failure.
            languageId={filters.language}
            levelId={filters.level}
            levelNumber={levelNumber}
            onClose={() => setAdding(false)}
          />
        ) : null}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
