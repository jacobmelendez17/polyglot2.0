"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListContextProvider,
  ResourceContextProvider,
  useNotify,
} from "react-admin";

import type { AdminImportRow } from "@/domains/admin";

import { describeAdminError } from "../admin-api-error";
import { AdminProblem, blockingError } from "../admin-problem";
import { CursorPagination } from "../cursor-pagination";
import { LanguageFilter } from "../language-filter";
import { ListSkeleton } from "../skeletons";
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
 * Imports are an Admin's end to end (the owner's decision of 2026-10-14): the page
 * and every endpoint behind it are `canPublishCurriculum`, re-checked from the
 * database role on each request, so this screen has no read-only form for anyone
 * else — the endpoint answers a role that has lost access with a 403, and the
 * screen says so in place of the list.
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
  const commands = useImportHistoryCommands();
  // The import whose permanent deletion is being confirmed. Held as a snapshot,
  // so a background refresh cannot change what the dialog is about.
  const [deleting, setDeleting] = useState<AdminImportRow | null>(null);

  const problem = blockingError(list.error, Boolean(list.rows));

  const refreshFailed = list.isRefetchError && !problem;
  const refreshError = list.error;
  useEffect(() => {
    if (refreshFailed) {
      notify(describeAdminError(refreshError).message, { type: "warning" });
    }
  }, [refreshFailed, refreshError, notify]);

  return (
    <ResourceContextProvider value="imports">
      <ListContextProvider value={list.listContext}>
        <LanguageFilter languages={languages} label="Filter imports" />
        {problem ? (
          <AdminProblem
            error={problem}
            onRetry={() => {
              void list.refetch();
            }}
          />
        ) : list.isPending ? (
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
            <ImportsDataTable
              archived={archived}
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
