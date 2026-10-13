"use client";

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

import { LEVEL_LIST_MAX } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { LanguageFilter } from "../language-filter";
import { ListSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { CreateLevelDialog } from "./create-level-dialog";
import { LevelsDataTable } from "./levels-data-table";
import { useLevelsList } from "./use-levels-list";

/**
 * `/admin/curriculum/levels`, on React Admin (spec 26 Unit 4): every level of
 * a language with what it holds, each linking to its detail page (where the
 * specialist `LevelItemBoard` stays), and an "Add level" command for those
 * allowed to use it.
 *
 * What each role sees follows the *server's* permissions, never a role name
 * held here: `canManageCurriculum` gets the list at all (the endpoint says so
 * with a 403 otherwise), and the `create` action on the `levels` resource —
 * which is the Admin-only structural permission — gets the button. A writer
 * therefore sees every level and no way to add one, and the endpoint would
 * refuse them anyway.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (an invitation, or a pointer to whose job it is), error (in place, a retry
 * only when one could help), forbidden. A denial always replaces whatever rows
 * are still cached; a transient failure keeps them with a warning.
 */
export function LevelsListScreen({
  languages,
}: {
  languages: { id: string; name: string }[];
}) {
  const notify = useNotify();
  const lookups = useMemo(() => ({ languages }), [languages]);
  const list = useLevelsList(lookups);
  const permissions = useAdminPermissions();
  const [adding, setAdding] = useState(false);

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

  const canCreate = Boolean(
    permissions.permissions?.resources.levels?.includes("create"),
  );
  const truncated = Boolean(
    (list.listContext.meta as { truncated?: boolean } | undefined)?.truncated,
  );

  return (
    <ResourceContextProvider value="levels">
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
          <LanguageFilter languages={languages} label="Filter levels" />
          {canCreate ? (
            <Button
              variant="contained"
              onClick={() => setAdding(true)}
              sx={{ ml: "auto" }}
            >
              Add level
            </Button>
          ) : null}
        </Box>

        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : list.isPending || !permissions.permissions ? (
          <ListSkeleton label="Loading the levels…" rows={4} />
        ) : (
          <>
            {!canCreate ? (
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mb: 1.5 }}
              >
                You can see every level. An Admin adds and edits them.
              </Typography>
            ) : null}
            {truncated ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Showing the first {LEVEL_LIST_MAX} levels.
              </Alert>
            ) : null}
            <LevelsDataTable
              canCreate={canCreate}
              onCreate={() => setAdding(true)}
            />
          </>
        )}

        {adding ? (
          <CreateLevelDialog
            // Opening it again is a new intent: it remounts, with nothing typed
            // and no stale failure.
            languageId={list.state.filters.language}
            onClose={() => setAdding(false)}
          />
        ) : null}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
