"use client";

import { AdminProblem, blockingError } from "../admin-problem";
import { FormSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { GroupDetails } from "./group-details";
import { GroupEditForm } from "./group-edit-form";
import type { GroupFields } from "./group-edit-model";

/**
 * A group's metadata on its page (spec 26 Unit 5): the editable form for
 * someone whose server permissions include editing a group, a read-only view
 * for someone who may see it but not change it.
 *
 * The choice follows the *server's* answer (`GET /api/v1/admin/me`, refetched
 * on focus), never a role name held here — so a role revoked mid-session turns
 * the form read-only on the next focus. The save endpoint refuses a non-Admin
 * regardless; nothing here is what protects the group.
 */
export function GroupEditScreen({
  groupId,
  fields,
}: {
  groupId: string;
  fields: GroupFields;
}) {
  const permissions = useAdminPermissions();
  const problem = blockingError(
    permissions.error,
    Boolean(permissions.permissions),
  );

  if (problem) {
    return (
      <AdminProblem
        error={problem}
        onRetry={() => void permissions.refetch()}
      />
    );
  }
  if (!permissions.permissions)
    return (
      <FormSkeleton label="Loading the properties of this group…" fields={2} />
    );

  const canEdit = Boolean(
    permissions.permissions.resources.groups?.includes("edit"),
  );
  return canEdit ? (
    <GroupEditForm groupId={groupId} initial={fields} />
  ) : (
    <GroupDetails fields={fields} />
  );
}
