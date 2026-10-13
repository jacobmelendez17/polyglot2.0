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

import type { AdminGroupUpdateRequest } from "@/domains/admin";

import { isDenial } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";
import { SavedIndicator } from "../saved-indicator";
import { STATUS_CHOICES, statusLabel } from "../status-choices";
import type { StatusImpact } from "../status-impact";
import { StatusImpactDialog } from "../status-impact-dialog";
import { useEditCommand } from "../use-edit-command";
import {
  changedFields,
  checkGroupName,
  readGroupFields,
  statusImpact,
  type GroupFields,
  type GroupFormValues,
} from "./group-edit-model";

/**
 * A group's metadata form (spec 26 Unit 5): name and status, on React Admin's
 * form primitives, saving through the explicit `updateGroup` command. It
 * replaces the hand-built form on the same page.
 *
 * What a save *does* — send only what changed, ask before an impactful status
 * change, key retries by intent, refresh the page after — is `useEditCommand`'s,
 * shared with every other Admin edit form. What is the group's own is here: the
 * fields, and `statusImpact` (archiving asks first; every other change saves
 * directly, as it did before).
 *
 * There is no position field, on purpose: a group's position is its lesson
 * number, and changing it is the reorder tool's job — a form that could type
 * one would also be able to collide with, or silently renumber, its siblings.
 */
export function GroupEditForm({
  groupId,
  initial,
}: {
  groupId: string;
  initial: GroupFields;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();

  const edit = useEditCommand<
    GroupFields,
    Omit<AdminGroupUpdateRequest, "idempotencyKey">,
    StatusImpact,
    GroupFormValues
  >({
    id: groupId,
    resource: "groups",
    initial,
    read: readGroupFields,
    changed: changedFields,
    impactOf: (from, to) => statusImpact(to.name, from.status, to.status),
    send: (changes, idempotencyKey) =>
      dataProvider.updateGroup(groupId, { ...changes, idempotencyKey }),
  });

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Form<GroupFormValues>
        onSubmit={edit.submit}
        defaultValues={{
          name: edit.baseline.name,
          status: edit.baseline.status,
        }}
        // React Admin's validators, not the browser's tooltips.
        noValidate
      >
        <TextInput
          source="name"
          label="Name"
          validate={checkGroupName}
          helperText={false}
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

        {edit.failure && !edit.confirming ? (
          <Alert
            severity={isDenial(edit.failure) ? "warning" : "error"}
            sx={{ mb: 2 }}
          >
            {edit.failure.message}
          </Alert>
        ) : null}

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
          <SaveButton label="Save" />
          <SavedIndicator<GroupFormValues>
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
