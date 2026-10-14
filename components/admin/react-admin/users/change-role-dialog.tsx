"use client";

import {
  SelectInput,
  TextInput,
  maxLength,
  required,
  useDataProvider,
} from "react-admin";
import { useQueryClient } from "@tanstack/react-query";
import Typography from "@mui/material/Typography";

import {
  USER_ROLE_REASON_MAX,
  type AdminUserRoleChangeResult,
  type AdminUserRow,
} from "@/domains/admin";
import { USER_ROLES, type UserRole } from "@/domains/users";

import { isDenial } from "../admin-api-error";
import type { AdminDataProvider } from "../admin-data-provider";
import { AdminFormDialog } from "../admin-form-dialog";
import { useCreateCommand } from "../use-create-command";
import { RoleImpact } from "./role-impact";
import { ROLE_CHOICES, ROLE_LABELS, personLabel } from "./role-model";

type FormValues = { role: string | null; reason: string | null };

type Request = {
  userId: string;
  role: UserRole;
  expectedUpdatedAt: string;
  reason?: string;
};

/**
 * "Change role" (spec 26 Unit 6): an explicit confirmation, on React Admin's
 * form primitives, calling the named `changeUserRole` command.
 *
 * - **The impact is shown first.** Choosing a role writes out what the person
 *   gains and loses (`RoleImpact`); a change that takes access away is a
 *   warning. Nothing is sent until the Admin presses **Change role**, which
 *   stays disabled until a different role has been chosen.
 * - **The version token is the one on the row**: if the account changed after
 *   the list was loaded, the server answers 409 (or 404, if it is gone). That,
 *   and "that would leave no Admin", cannot be fixed by pressing again, so the
 *   dialog then offers **Close** only — and closing re-reads the list, so the
 *   Admin sees what it is now.
 * - **A different request is a different intent** (`useCreateCommand`): another
 *   role, or another reason, gets a new idempotency key; an unchanged retry of a
 *   failed request keeps its key, so one that did get through is not applied twice.
 * - After a success the account list is marked stale and so are the cached
 *   permissions (`GET /api/v1/admin/me`) — the server enforces the new role on
 *   the person's very next request, and nothing here waits on Clerk.
 */
export function ChangeRoleDialog({
  user,
  onClose,
  onChanged,
  onStale,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onChanged: (result: AdminUserRoleChangeResult) => void;
  /** The view this dialog was opened from is out of date: re-read it. */
  onStale: () => void;
}) {
  const dataProvider = useDataProvider<AdminDataProvider>();
  const queryClient = useQueryClient();
  const person = personLabel(user);

  const { create, pending, failure } = useCreateCommand<
    Request,
    AdminUserRoleChangeResult
  >({
    resource: "users",
    send: ({ userId, ...rest }, idempotencyKey) =>
      dataProvider.changeUserRole(userId, { ...rest, idempotencyKey }),
    onCreated: (result) => {
      // The permissions a screen cached are convenience state, never authority;
      // refreshing them keeps what is drawn honest about what the server now says.
      void queryClient.invalidateQueries({
        queryKey: ["auth", "getPermissions"],
      });
      onChanged(result);
    },
  });

  // The view this dialog was opened from is out of date — the account changed
  // (409), or is gone (404) — and no number of retries fixes that.
  const stale = failure?.kind === "conflict" || failure?.kind === "not_found";

  return (
    <AdminFormDialog<FormValues>
      titleId="change-role-title"
      title="Change role"
      description={`${person} is currently ${ROLE_LABELS[user.role]}.`}
      defaultValues={{ role: user.role, reason: null }}
      onSubmit={(values) => {
        const role = USER_ROLES.find((candidate) => candidate === values.role);
        if (!role) return Promise.resolve();
        const reason = values.reason?.trim() ?? "";
        return create({
          userId: user.id,
          role,
          expectedUpdatedAt: user.updatedAt,
          ...(reason === "" ? {} : { reason }),
        });
      }}
      submitLabel="Change role"
      pendingLabel="Changing…"
      pending={pending}
      failure={failure}
      closeOnly={isDenial(failure) || stale}
      onClose={() => {
        if (stale) onStale();
        onClose();
      }}
    >
      <Typography
        variant="caption"
        sx={{ display: "block", mb: 1.5, color: "text.secondary" }}
      >
        Account id: <code>{user.id}</code>
      </Typography>

      <SelectInput
        source="role"
        label="New role"
        choices={ROLE_CHOICES}
        validate={required()}
        helperText={false}
        fullWidth
      />
      <RoleImpact current={user.role} person={person} />
      <TextInput
        source="reason"
        label="Reason (optional)"
        helperText="Kept in the audit log."
        validate={maxLength(
          USER_ROLE_REASON_MAX,
          `Keep the reason to ${USER_ROLE_REASON_MAX} characters or fewer.`,
        )}
        multiline
        minRows={2}
        fullWidth
      />
    </AdminFormDialog>
  );
}
