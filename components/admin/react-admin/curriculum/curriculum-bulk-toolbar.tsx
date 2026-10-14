"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useListContext, useTranslate } from "react-admin";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import {
  CURRICULUM_BULK_ITEM_LIMIT,
  type AdminCurriculumRow,
} from "@/domains/admin";

import { BulkArchiveDialog } from "./bulk-archive-dialog";
import { publishBlockedNote } from "./bulk-impact";
import { BulkMoveDialog } from "./bulk-move-dialog";
import { BulkPublishDialog } from "./bulk-publish-dialog";
import { itemCount, publishPlan, type BulkRow } from "./bulk-selection";

type Lookups = {
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
};

/** The question being asked about the rows that were selected when it opened. */
type OpenDialog = {
  command: "publish" | "archive" | "move-level" | "move-group";
  /** A snapshot: a refetch behind the dialog cannot change what it will send. */
  rows: BulkRow[];
};

/**
 * The selection bar for the curriculum list (spec 26 Unit 7), on React
 * Admin's selection state: what is selected is the list context's
 * `selectedIds`, and what the bar does with it is four explicit, whitelisted
 * commands — publish, move to a level, move to a group, archive — each with
 * its own confirmation that says what it will do to *this* selection. There is
 * no bulk delete.
 *
 * It is only mounted for someone who may use the commands (the table does not
 * show a checkbox column to anyone else), and the server decides regardless.
 *
 * **Publish is offered only when every selected item is Pending**, because the
 * service publishes all of them or none. When it is not offered the bar says
 * why, and offers to narrow the selection to the Pending ones — the person
 * chooses; nothing is silently sent for a subset. Archive and move take any
 * selection: they leave an item that is already where it is asked to be, and
 * the confirmation says how many.
 *
 * **Scope.** The selection is cleared by the list when the page or any filter
 * changes (`useCursorList`), and a question open about it is closed with it —
 * a decision made on one view is not carried to another.
 *
 * Ordering is not here: moved items join the end of their new level's order,
 * and arranging them is the specialist reorder tool's, linked from the page.
 */
export function CurriculumBulkToolbar({ levels, groups }: Lookups) {
  const { data, selectedIds, onSelect, onUnselectItems, filterValues } =
    useListContext<AdminCurriculumRow>();
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const rows = (data ?? []).filter((row) => selectedIds.includes(row.id));
  const languageId =
    typeof filterValues.language === "string" ? filterValues.language : "";

  // The selection is gone (the page or the filters changed, or these rows left
  // the view), and so is the question about it. Adjusted during render, not in
  // an effect, so a closed question never paints once more against new rows.
  const openDialog = rows.length > 0 ? dialog : null;
  if (dialog && !openDialog) setDialog(null);

  const publish = publishPlan(rows);
  const tooMany = rows.length > CURRICULUM_BULK_ITEM_LIMIT;
  const canAct = languageId !== "" && !tooMany;

  function open(command: OpenDialog["command"]) {
    setDialog({ command, rows });
  }

  function finish() {
    setDialog(null);
    onUnselectItems();
  }

  // After a stale refusal: look at the list again, from nothing selected. The
  // page is asked to re-render too, because the level and group choices are
  // read by the server page.
  function reload() {
    finish();
    void queryClient.invalidateQueries({ queryKey: ["curriculum"] });
    router.refresh();
  }

  const shared = {
    languageId,
    onClose: () => setDialog(null),
    onDone: finish,
    onReload: reload,
  };

  return (
    <>
      {rows.length > 0 ? (
        <Box
          // A labelled group, not `role="toolbar"`: a toolbar promises arrow-key
          // movement between its controls, and these are ordinary tab stops.
          role="group"
          aria-label="Actions for the selected items"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 2,
            rowGap: 0.5,
            px: 2,
            py: 1,
            borderBottom: "1px solid var(--border-default)",
            backgroundColor: "action.hover",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <IconButton
              size="small"
              aria-label={translate("ra.action.unselect", { _: "Unselect" })}
              title={translate("ra.action.unselect", { _: "Unselect" })}
              onClick={() => onUnselectItems()}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="body2"
              aria-live="polite"
              sx={{ fontWeight: 600 }}
            >
              {translate("ra.action.bulk_actions", {
                smart_count: rows.length,
                _: `${itemCount(rows.length)} selected`,
              })}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              ml: { sm: "auto" },
            }}
          >
            <Button
              size="small"
              variant="contained"
              disabled={!canAct || !publish.canPublish}
              onClick={() => open("publish")}
            >
              Publish
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!canAct}
              onClick={() => open("move-level")}
            >
              Move to level
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!canAct}
              onClick={() => open("move-group")}
            >
              Move to group
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={!canAct}
              onClick={() => open("archive")}
            >
              Archive
            </Button>
          </Box>

          {tooMany ? (
            <Typography
              variant="caption"
              sx={{ flexBasis: "100%", color: "text.secondary" }}
            >
              These actions take up to {CURRICULUM_BULK_ITEM_LIMIT} items at a
              time — {rows.length} are selected.
            </Typography>
          ) : !publish.canPublish ? (
            <Box
              sx={{
                flexBasis: "100%",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                columnGap: 1,
              }}
            >
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {publishBlockedNote(publish)}
              </Typography>
              {publish.pending.length > 0 ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => onSelect(publish.pending.map((row) => row.id))}
                >
                  Select only the {publish.pending.length} Pending
                </Button>
              ) : null}
            </Box>
          ) : null}
        </Box>
      ) : null}

      {openDialog?.command === "publish" ? (
        <BulkPublishDialog rows={openDialog.rows} {...shared} />
      ) : null}
      {openDialog?.command === "archive" ? (
        <BulkArchiveDialog rows={openDialog.rows} {...shared} />
      ) : null}
      {openDialog?.command === "move-level" ? (
        <BulkMoveDialog
          kind="level"
          rows={openDialog.rows}
          levels={levels}
          groups={groups}
          {...shared}
        />
      ) : null}
      {openDialog?.command === "move-group" ? (
        <BulkMoveDialog
          kind="group"
          rows={openDialog.rows}
          levels={levels}
          groups={groups}
          {...shared}
        />
      ) : null}
    </>
  );
}
