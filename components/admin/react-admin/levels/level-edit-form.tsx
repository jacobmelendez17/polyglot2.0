"use client";

import {
  Form,
  SaveButton,
  SelectInput,
  TextInput,
  required,
  useDataProvider,
} from "react-admin";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { AdminLevelUpdateRequest } from "@/domains/admin";

import { isDenial } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";
import { SavedIndicator } from "../saved-indicator";
import { STATUS_CHOICES, statusLabel } from "../status-choices";
import { StatusImpactDialog } from "../status-impact-dialog";
import type { StatusImpact } from "../status-impact";
import { useEditCommand } from "../use-edit-command";
import {
  CEFR_CHOICES,
  CEFR_NONE,
  CEFR_NONE_TEXT,
  changedFields,
  describeLevelContents,
  readLevelFields,
  statusImpact,
  type LevelFields,
  type LevelFormValues,
} from "./level-edit-model";

type Counts = {
  vocabularyItems: number;
  grammarItems: number;
  vocabularyGroups: number;
};

/**
 * The level's metadata form (spec 26 Unit 4): name, CEFR band, and status, on
 * React Admin's form primitives, saving through the explicit `updateLevel`
 * command. It replaces the hand-built form on the same page; the specialist
 * `LevelItemBoard` below it is untouched.
 *
 * What a save *does* — send only what changed, ask before a status change that
 * alters what learners see, key retries by intent, refresh the page after — is
 * `useEditCommand`'s, shared with every other Admin edit form. What is level's
 * own is here: the fields, and `statusImpact` (publishing a level or taking one
 * off-line is a decision, never a side effect of Save).
 *
 * Counts are shown for information. A level holds any number of any kind of
 * item and publishing it is an Admin's call (spec 17; no 48/12 gate).
 */
export function LevelEditForm({
  levelId,
  levelNumber,
  initial,
  counts,
}: {
  levelId: string;
  levelNumber: number;
  initial: LevelFields;
  counts: Counts;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();

  const edit = useEditCommand<
    LevelFields,
    Omit<AdminLevelUpdateRequest, "idempotencyKey">,
    StatusImpact,
    LevelFormValues
  >({
    id: levelId,
    resource: "levels",
    initial,
    read: readLevelFields,
    changed: changedFields,
    impactOf: (from, to) => statusImpact(levelNumber, from.status, to.status),
    send: (changes, idempotencyKey) =>
      dataProvider.updateLevel(levelId, { ...changes, idempotencyKey }),
  });

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Form<LevelFormValues>
        onSubmit={edit.submit}
        defaultValues={{
          name: edit.baseline.name,
          cefrLevel: edit.baseline.cefrLevel ?? CEFR_NONE,
          status: edit.baseline.status,
        }}
        // React Admin's validators, not the browser's tooltips.
        noValidate
      >
        <TextInput
          source="name"
          label="Name"
          helperText="Optional."
          fullWidth
        />
        <SelectInput
          source="cefrLevel"
          label="CEFR band"
          choices={CEFR_CHOICES}
          emptyValue={CEFR_NONE}
          emptyText={CEFR_NONE_TEXT}
          helperText="Shown on every item page in this level. Leave unset and item pages simply omit it."
          fullWidth
        />
        <SelectInput
          source="status"
          label="Status"
          choices={STATUS_CHOICES}
          validate={required()}
          helperText={false}
          fullWidth
        />

        <Typography
          variant="body2"
          sx={{ color: "text.secondary", mt: 1, mb: 2 }}
        >
          {describeLevelContents(counts)}
        </Typography>

        {edit.failure && !edit.confirming ? (
          <Alert
            severity={isDenial(edit.failure) ? "warning" : "error"}
            sx={{ mb: 2 }}
          >
            {edit.failure.message}
          </Alert>
        ) : null}

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <SaveButton label="Save" />
          <SavedIndicator<LevelFormValues>
            saved={edit.saved}
            differs={edit.differs}
          />
        </Box>
      </Form>

      {edit.confirming ? (
        <StatusImpactDialog
          impact={edit.confirming.impact}
          from={statusLabel(edit.confirming.from.status)}
          to={statusLabel(edit.confirming.to.status)}
          saving={edit.saving}
          failure={edit.failure}
          onConfirm={edit.confirm}
          onClose={edit.cancel}
        />
      ) : null}
    </Box>
  );
}
