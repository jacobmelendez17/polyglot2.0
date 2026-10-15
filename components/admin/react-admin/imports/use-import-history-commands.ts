import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify } from "react-admin";

import type { AdminImportCommandResult, AdminImportRow } from "@/domains/admin";

import type { AdminApiError } from "../admin-api-error";
import { describeAdminError, isDenial } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";

/** Everything that shows the history, by React Admin's query-key prefix (`[resource, method, ...]`) — both the normal and the archived one. */
export const IMPORT_HISTORY_QUERY_KEY = ["imports"] as const;

/**
 * Archiving and restoring an import (spec 26 Unit 8): two explicit commands,
 * each a click on a row with no dialog — both are reversible, change history
 * only, and are idempotent in the service, so there is nothing to confirm and no
 * key to carry. (Permanently deleting is the irreversible one, and has its own
 * dialog.)
 *
 * Whatever the answer, the history is marked stale: a success moved a row
 * between the two histories, and a failure — most often "no longer exists" — is
 * a sign the list on screen is out of date. Deliberately **no automatic retry**.
 *
 * A command is never sent twice for one import while the first is still in
 * flight. Disabling the button does that only after React has drawn it again —
 * a fast double click lands before that — so the guard is a ref, set in the
 * same breath as the click and cleared when the answer (or the failure) comes.
 */
export function useImportHistoryCommands() {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const queryClient = useQueryClient();
  const notify = useNotify();

  /** The imports a command has been sent for and not yet heard back about. */
  const inFlight = useRef(new Set<string>());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: IMPORT_HISTORY_QUERY_KEY });

  const settle = (row: AdminImportRow) => {
    inFlight.current.delete(row.id);
    return refresh();
  };

  const onError = (error: AdminApiError) => {
    const failure = describeAdminError(error);
    notify(failure.message, { type: isDenial(failure) ? "warning" : "error" });
  };

  const archive = useMutation<
    AdminImportCommandResult,
    AdminApiError,
    AdminImportRow
  >({
    mutationFn: (row) => dataProvider.archiveImport(row.id),
    retry: false,
    onSuccess: (_result, row) =>
      notify(`Archived “${row.originalFilename}”. It is under Archived now.`, {
        type: "success",
      }),
    onError,
    onSettled: (_result, _error, row) => settle(row),
  });

  const restore = useMutation<
    AdminImportCommandResult,
    AdminApiError,
    AdminImportRow
  >({
    mutationFn: (row) => dataProvider.restoreImport(row.id),
    retry: false,
    onSuccess: (_result, row) =>
      notify(`Restored “${row.originalFilename}” to the import history.`, {
        type: "success",
      }),
    onError,
    onSettled: (_result, _error, row) => settle(row),
  });

  const send = (
    row: AdminImportRow,
    command: { mutate: (row: AdminImportRow) => void },
  ) => {
    if (inFlight.current.has(row.id)) return;
    inFlight.current.add(row.id);
    command.mutate(row);
  };

  return {
    archive: (row: AdminImportRow) => send(row, archive),
    restore: (row: AdminImportRow) => send(row, restore),
    /** The import a command is in flight for, if any. */
    pendingId:
      (archive.isPending ? archive.variables?.id : undefined) ??
      (restore.isPending ? restore.variables?.id : undefined) ??
      null,
  };
}
