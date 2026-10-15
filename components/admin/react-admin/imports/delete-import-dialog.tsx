"use client";

import { useRef, useState } from "react";
import { useDataProvider, useNotify } from "react-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DialogContentText from "@mui/material/DialogContentText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import {
  IMPORT_DELETE_CONFIRMATION,
  type AdminImportCommandResult,
  type AdminImportRow,
} from "@/domains/admin";

import { describeAdminError, type AdminApiError } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";
import { BulkCommandDialog } from "../curriculum/bulk-command-dialog";
import { IMPORT_HISTORY_QUERY_KEY } from "./use-import-history-commands";

/**
 * "Permanently delete this import?" (spec 19 §26; spec 26 Unit 8) — the one
 * irreversible command on the history. It removes the import's record, its
 * stored row results and, best effort, its source file; it does **not** undo the
 * curriculum the import made or changed. Only an archived import can be deleted.
 *
 * The person must type `DELETE` — exactly, case and all — before the button
 * works, and the endpoint checks the same word again. The confirmation is what
 * the old dialog asked, in the same words.
 *
 * Its failures are the shared command dialog's: a stale view (the import is gone,
 * or was restored since the list loaded) offers only **Reload the list**, a lost
 * permission only **Close**, a transient failure **Try again** — the word typed
 * is kept. There is no idempotency key: a second delete of the same import is a
 * 404, which the dialog reads as exactly that — gone already.
 */
export function DeleteImportDialog({
  row,
  onClose,
}: {
  row: AdminImportRow;
  onClose: () => void;
}) {
  const notify = useNotify();
  const dataProvider = useDataProvider<AdminDataProvider>();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  // Set in the same breath as the click or the Enter, cleared when the answer
  // comes: `deletion.isPending` only changes once React has drawn again, which a
  // fast second Enter does not wait for.
  const sending = useRef(false);

  const deletion = useMutation<AdminImportCommandResult, AdminApiError, void>({
    mutationFn: () =>
      dataProvider.deleteImport(row.id, {
        confirmation: IMPORT_DELETE_CONFIRMATION,
      }),
    retry: false,
    onSettled: () => {
      sending.current = false;
    },
  });
  const failure = deletion.error ? describeAdminError(deletion.error) : null;
  const canConfirm = typed === IMPORT_DELETE_CONFIRMATION;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: IMPORT_HISTORY_QUERY_KEY });

  function confirm() {
    if (!canConfirm || deletion.isPending || sending.current) return;
    sending.current = true;
    deletion.mutate(undefined, {
      onSuccess: () => {
        notify(`Permanently deleted “${row.originalFilename}”.`, {
          type: "success",
        });
        void refresh();
        onClose();
      },
    });
  }

  return (
    <BulkCommandDialog
      titleId="delete-import-title"
      title="Permanently delete this import?"
      confirmLabel="Permanently delete"
      pendingLabel="Deleting…"
      destructive
      canConfirm={canConfirm}
      pending={deletion.isPending}
      failure={failure}
      onConfirm={confirm}
      onClose={onClose}
      onReload={() => {
        void refresh();
        onClose();
      }}
    >
      <DialogContentText>
        This removes the import record, stored row results, and remaining source
        file. This does not undo curriculum changes made by the import.
      </DialogContentText>
      <Typography
        variant="body2"
        sx={{ mt: 1.5, fontWeight: 500, overflowWrap: "anywhere" }}
      >
        {row.originalFilename}
      </Typography>
      <TextField
        autoFocus
        fullWidth
        size="small"
        label={`Type ${IMPORT_DELETE_CONFIRMATION} to continue`}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          }
        }}
        disabled={deletion.isPending}
        slotProps={{ htmlInput: { autoComplete: "off" } }}
        sx={{ mt: 2 }}
      />
    </BulkCommandDialog>
  );
}
