"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";
import Typography from "@mui/material/Typography";

import type { AdminImportRow } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { CursorPagination } from "../cursor-pagination";
import { LanguageFilter } from "../language-filter";
import { ListSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { DeleteImportDialog } from "./delete-import-dialog";
import { ImportsDataTable } from "./imports-data-table";
import { useImportHistoryCommands } from "./use-import-history-commands";
import { useImportsList } from "./use-imports-list";

/**
 * `/admin/curriculum/imports` and `/imports/archived`, on React Admin (spec 26
 * Unit 8): a language's curriculum-import history as a cursor-paginated list —
 * the normal history, or the archived one (`archived`) — with the row commands
 * for those allowed to use them.
 *
 * What each role sees follows the *server's* permissions, never a role name held
 * here: `canManageCurriculum` gets the list at all (the endpoint says so with a
 * 403 otherwise), and `canPublishCurriculum` additionally gets Archive, Restore
 * and Permanently delete. A writer therefore sees what has been imported, with no
 * buttons — and the endpoints would refuse them anyway.
 *
 * The list reads itself again while the pipeline is working on an import, so a
 * "Processing" row becomes "Needs review" without a reload, and stops when
 * nothing is moving. The screens the history links to — an import's own page,
 * with its row review, corrections, Confirm, Retry and explicit publish — are
 * the specialist ones and are unchanged.
 *
 * States, per ui-context.md: loading (a skeleton shaped like the table), empty
 * (designed, told apart from "past the end"), error (in place, a retry only when
 * one could help), and forbidden. A denial always replaces whatever rows are
 * still cached; a transient failure keeps them with a warning.
 */
export function ImportsListScreen({
  languages,
  archived,
  refreshMs,
}: {
  languages: { id: string; name: string }[];
  archived: boolean;
  /** How often to read the history again while an import is being worked on. A test seam; the default is `IMPORT_REFRESH_MS`. */
  refreshMs?: number;
}) {
  const notify = useNotify();
  const lookups = useMemo(() => ({ languages }), [languages]);
  const list = useImportsList(lookups, archived, refreshMs);
  const permissions = useAdminPermissions();
  const commands = useImportHistoryCommands();
  // The import whose permanent deletion is being confirmed. Held as a snapshot,
  // so a background refresh cannot change what the dialog is about.
  const [deleting, setDeleting] = useState<AdminImportRow | null>(null);

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

  const canAct = Boolean(permissions.permissions?.canPublishCurriculum);

  return (
    <ResourceContextProvider value="imports">
      <ListContextProvider value={list.listContext}>
        <LanguageFilter languages={languages} label="Filter imports" />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
              void permissions.refetch();
            }}
          />
        ) : list.isPending || !permissions.permissions ? (
          <ListSkeleton
            label={
              archived
                ? "Loading archived imports…"
                : "Loading the import history…"
            }
            rows={6}
          />
        ) : (
          <>
            {!canAct ? (
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mb: 1.5 }}
              >
                You can see what has been imported. An Admin starts and manages
                imports.
              </Typography>
            ) : null}
            <ImportsDataTable
              archived={archived}
              canAct={canAct}
              pendingId={commands.pendingId}
              onArchive={commands.archive}
              onRestore={commands.restore}
              onDelete={setDeleting}
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

        {deleting ? (
          <DeleteImportDialog
            // Another import is another intent: it remounts, with nothing typed.
            key={deleting.id}
            row={deleting}
            onClose={() => setDeleting(null)}
          />
        ) : null}
      </ListContextProvider>
    </ResourceContextProvider>
  );
}
