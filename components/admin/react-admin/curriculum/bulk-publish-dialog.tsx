"use client";

import { useDataProvider, useNotify } from "react-admin";
import DialogContentText from "@mui/material/DialogContentText";

import type {
  AdminCurriculumBulkPublishRequest,
  AdminCurriculumBulkPublishResult,
} from "@/domains/admin";

import type { AdminDataProvider } from "../admin-data-provider";
import { BulkCommandDialog, SelectedItemsList } from "./bulk-command-dialog";
import { publishedMessage } from "./bulk-impact";
import { itemCount, type BulkRow } from "./bulk-selection";
import { useBulkCurriculumCommand } from "./use-bulk-curriculum-command";

/**
 * The confirmation before publishing the selected **Pending** items together
 * (spec 26 Unit 7: "explicit confirmation/impact when publication can change
 * learner-visible content").
 *
 * It is only ever opened for a selection that is entirely Pending — the
 * toolbar will not offer Publish otherwise, and says why — but the server
 * decides: if any item stopped being Pending in the meantime it refuses the
 * whole batch with a conflict and **nothing** is published, and this dialog
 * then offers "Reload the list" rather than a retry.
 */
export function BulkPublishDialog({
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

  const { create, pending, failure } = useBulkCurriculumCommand<
    Omit<AdminCurriculumBulkPublishRequest, "idempotencyKey">,
    AdminCurriculumBulkPublishResult
  >({
    send: (request, idempotencyKey) =>
      dataProvider.bulkPublishCurriculum({ ...request, idempotencyKey }),
    onDone: (result) => {
      notify(publishedMessage(result.publishedItemIds.length), {
        type: "success",
      });
      onDone();
    },
  });

  return (
    <BulkCommandDialog
      titleId="bulk-publish-title"
      title={`Publish ${itemCount(rows.length)}?`}
      confirmLabel="Publish"
      pendingLabel="Publishing…"
      pending={pending}
      failure={failure}
      onConfirm={() =>
        void create({ languageId, itemIds: rows.map((row) => row.id) })
      }
      onClose={onClose}
      onReload={onReload}
    >
      <DialogContentText>
        {rows.length === 1
          ? "This item becomes visible to learners for the first time."
          : "These items become visible to learners for the first time. All publish together, or none do."}
      </DialogContentText>
      <SelectedItemsList rows={rows} label="Items to publish" />
    </BulkCommandDialog>
  );
}
