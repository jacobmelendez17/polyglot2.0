"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useDataProvider, useNotify } from "react-admin";
import DialogContentText from "@mui/material/DialogContentText";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type {
  AdminCurriculumBulkMoveRequest,
  AdminCurriculumBulkMoveResult,
} from "@/domains/admin";

import type { AdminDataProvider } from "../admin-data-provider";
import {
  BulkCommandDialog,
  ImpactNotes,
  SelectedItemsList,
} from "./bulk-command-dialog";
import {
  moveToGroupImpact,
  moveToLevelImpact,
  movedMessage,
  type MoveImpact,
} from "./bulk-impact";
import {
  itemCount,
  moveToGroupPlan,
  moveToLevelPlan,
  type BulkRow,
} from "./bulk-selection";
import { useBulkCurriculumCommand } from "./use-bulk-curriculum-command";

type LevelChoice = { id: string; levelNumber: number };
type GroupChoice = { id: string; name: string; levelNumber: number };

/**
 * The confirmation before moving the selected items to a level or a group
 * (spec 26 Unit 7). Both are the same command with a different target: the
 * target is picked here, and once it is, the dialog says what that will do to
 * *this* selection — which items move, which are already there and are left
 * alone, which lose a group, which are live to learners.
 *
 * Moved items join the end of the new level's order; arranging them is the
 * specialist tools' — the level page's board (`LevelItemBoard`), which the
 * dialog links to, and the reorder tool (`ItemReorderList`), linked from the
 * Curriculum page. The targets are the language's own levels and groups, and the
 * server refuses a target from another language, so a stale choice cannot cross
 * languages.
 */
export function BulkMoveDialog({
  kind,
  rows,
  languageId,
  levels,
  groups,
  onClose,
  onDone,
  onReload,
}: {
  kind: "level" | "group";
  /** The rows selected when the dialog opened — a snapshot, so a refetch cannot change what is sent. */
  rows: readonly BulkRow[];
  languageId: string;
  levels: readonly LevelChoice[];
  groups: readonly GroupChoice[];
  onClose: () => void;
  /** The command succeeded: the caller clears the selection and closes the dialog. */
  onDone: () => void;
  onReload: () => void;
}) {
  const notify = useNotify();
  const dataProvider = useDataProvider<AdminDataProvider>();
  const [targetId, setTargetId] = useState("");

  const options =
    kind === "level"
      ? levels.map((level) => ({
          id: level.id,
          label: `Level ${level.levelNumber}`,
        }))
      : groups.map((group) => ({
          id: group.id,
          label: `L${group.levelNumber} — ${group.name}`,
        }));
  const target = options.find((option) => option.id === targetId);
  const impact = impactOf(kind, rows, targetId, levels, groups);
  const chosenLevel =
    kind === "level"
      ? levels.find((candidate) => candidate.id === targetId)
      : undefined;

  const { create, pending, failure } = useBulkCurriculumCommand<
    Omit<AdminCurriculumBulkMoveRequest, "idempotencyKey">,
    AdminCurriculumBulkMoveResult
  >({
    send: (request, idempotencyKey) =>
      dataProvider.bulkMoveCurriculum({ ...request, idempotencyKey }),
    onDone: (result) => {
      const where =
        kind === "level"
          ? (target?.label ?? "the level")
          : `“${groups.find((group) => group.id === targetId)?.name ?? "the group"}”`;
      notify(
        movedMessage(
          result.movedItemIds.length,
          result.unchangedItemIds.length,
          where,
        ),
        { type: "success" },
      );
      onDone();
    },
  });

  function confirm() {
    const itemIds = rows.map((row) => row.id);
    void create(
      kind === "level"
        ? { languageId, itemIds, levelId: targetId }
        : { languageId, itemIds, groupId: targetId },
    );
  }

  return (
    <BulkCommandDialog
      titleId="bulk-move-title"
      title={`Move ${itemCount(rows.length)} to a ${kind}`}
      confirmLabel="Move"
      pendingLabel="Moving…"
      canConfirm={
        target !== undefined && impact !== null && !impact.nothingToDo
      }
      pending={pending}
      failure={failure}
      onConfirm={confirm}
      onClose={onClose}
      onReload={onReload}
    >
      <DialogContentText>
        Existing learner progress stays with each item.
        {rows.length > 1 ? " All move together, or none do." : ""}
      </DialogContentText>

      <TextField
        select
        fullWidth
        size="small"
        label={kind === "level" ? "Target level" : "Target group"}
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
        disabled={pending || options.length === 0}
        helperText={
          options.length === 0
            ? kind === "level"
              ? "This language has no levels yet."
              : "This language has no groups yet."
            : undefined
        }
        sx={{ mt: 2 }}
      >
        {options.map((option) => (
          <MenuItem key={option.id} value={option.id}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      {impact ? (
        <>
          <DialogContentText sx={{ mt: 2, fontWeight: 500 }}>
            {impact.headline}
          </DialogContentText>
          <ImpactNotes notes={impact.notes} />
          {chosenLevel && !impact.nothingToDo ? (
            // Ordering is not done here: it is the level page's board (and the
            // reorder tool's), which this points to rather than imitates.
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              They can be arranged afterwards on{" "}
              <Link
                component={NextLink}
                href={`/admin/curriculum/levels/${chosenLevel.id}`}
                underline="hover"
              >
                Level {chosenLevel.levelNumber}&apos;s page
              </Link>
              .
            </Typography>
          ) : null}
        </>
      ) : null}

      <SelectedItemsList rows={rows} label="Items to move" />
    </BulkCommandDialog>
  );
}

/** What moving `rows` to the chosen target would do; `null` until a target is chosen. */
function impactOf(
  kind: "level" | "group",
  rows: readonly BulkRow[],
  targetId: string,
  levels: readonly LevelChoice[],
  groups: readonly GroupChoice[],
): MoveImpact | null {
  if (kind === "level") {
    const level = levels.find((candidate) => candidate.id === targetId);
    return level
      ? moveToLevelImpact(
          moveToLevelPlan(rows, level.id),
          rows.length,
          level.levelNumber,
        )
      : null;
  }
  const group = groups.find((candidate) => candidate.id === targetId);
  return group
    ? moveToGroupImpact(moveToGroupPlan(rows, group), rows.length, group)
    : null;
}
