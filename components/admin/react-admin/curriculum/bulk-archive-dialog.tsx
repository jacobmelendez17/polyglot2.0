"use client";

import { useDataProvider, useNotify } from "react-admin";
import DialogContentText from "@mui/material/DialogContentText";

import type {
  AdminCurriculumBulkArchiveRequest,
  AdminCurriculumBulkArchiveResult,
} from "@/domains/admin";

import type { AdminDataProvider } from "../admin-data-provider";
import {
  BulkCommandDialog,
  ImpactNotes,
  SelectedItemsList,
} from "./bulk-command-dialog";
import { archiveNotes, archivedMessage } from "./bulk-impact";
import { archivePlan, itemCount, type BulkRow } from "./bulk-selection";
import { useBulkCurriculumCommand } from "./use-bulk-curriculum-command";

/**
 * The confirmation before archiving the selected items together (spec 26
 * Unit 7). Archiving is the only way a bulk command takes content out of
 * learners' hands — there is no bulk delete — so it is the one styled as a
 * warning, and it says what it will do to *this* selection: which items are
 * live now, which carry unpublished changes that are discarded, and which are
 * already archived and will be left alone.
 *
 * Every item is archived together, or none are. One that is gone by the time
 * the server looks refuses the batch, and the dialog offers "Reload the list".
 */
export function BulkArchiveDialog({
  rows,
  languageId,
  onClose,
  onDone,
  onReload,
}: {
  /** The rows selected when the dialog opened — a snapshot, so a refetch cannot change what is sent. */
  rows: readonly BulkRow[];
  languageId: string;
  onClose: () => void;
  /** The command succeeded: the caller clears the selection and closes the dialog. */
  onDone: () => void;
  onReload: () => void;
}) {
  const notify = useNotify();
  const dataProvider = useDataProvider<AdminDataProvider>();
  const plan = archivePlan(rows);

  const { create, pending, failure } = useBulkCurriculumCommand<
    Omit<AdminCurriculumBulkArchiveRequest, "idempotencyKey">,
    AdminCurriculumBulkArchiveResult
  >({
    send: (request, idempotencyKey) =>
      dataProvider.bulkArchiveCurriculum({ ...request, idempotencyKey }),
    onDone: (result) => {
      notify(
        archivedMessage(
          result.archivedItemIds.length,
          result.alreadyArchivedItemIds.length,
        ),
        { type: "success" },
      );
      onDone();
    },
  });

  const nothingToDo = plan.archiving === 0;

  return (
    <BulkCommandDialog
      titleId="bulk-archive-title"
      title={
        nothingToDo
          ? "Nothing to archive"
          : `Archive ${itemCount(plan.archiving)}?`
      }
      confirmLabel="Archive"
      pendingLabel="Archiving…"
      destructive
      canConfirm={!nothingToDo}
      pending={pending}
      failure={failure}
      onConfirm={() =>
        void create({ languageId, itemIds: rows.map((row) => row.id) })
      }
      onClose={onClose}
      onReload={onReload}
    >
      {nothingToDo ? (
        <DialogContentText>
          {rows.length === 1
            ? "The selected item is already archived."
            : `All ${rows.length} selected items are already archived.`}
        </DialogContentText>
      ) : (
        <>
          <DialogContentText>
            Archiving withdraws items from learners&apos; browsing and from new
            lessons. Learner progress is kept, and anything a learner is already
            reviewing stays in their reviews.
            {rows.length > 1 ? " All archive together, or none do." : ""}
          </DialogContentText>
          <ImpactNotes notes={archiveNotes(plan)} />
        </>
      )}
      <SelectedItemsList rows={rows} label="Items to archive" />
    </BulkCommandDialog>
  );
}
