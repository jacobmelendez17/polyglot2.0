"use client";

import { AdminProblem, blockingError } from "../admin-problem";
import { FormSkeleton } from "../skeletons";
import { useAdminPermissions } from "../use-admin-permissions";
import { LevelDetails } from "./level-details";
import { LevelEditForm } from "./level-edit-form";
import type { LevelFields } from "./level-edit-model";

/**
 * A level's metadata on its detail page (spec 26 Unit 4): the editable form for
 * someone whose server permissions include editing a level, a read-only view
 * for someone who may see it but not change it.
 *
 * The choice follows the *server's* answer (`GET /api/v1/admin/me`, refetched
 * on focus), never a role name held here — so a role revoked mid-session turns
 * the form read-only on the next focus. The save endpoint refuses a non-Admin
 * regardless; nothing here is what protects the level.
 */
export function LevelEditScreen({
  levelId,
  levelNumber,
  fields,
  counts,
}: {
  levelId: string;
  levelNumber: number;
  fields: LevelFields;
  counts: {
    vocabularyItems: number;
    grammarItems: number;
    vocabularyGroups: number;
  };
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
    return <FormSkeleton label="Loading the properties of this level…" />;

  const canEdit = Boolean(
    permissions.permissions.resources.levels?.includes("edit"),
  );
  return canEdit ? (
    <LevelEditForm
      levelId={levelId}
      levelNumber={levelNumber}
      initial={fields}
      counts={counts}
    />
  ) : (
    <LevelDetails fields={fields} counts={counts} />
  );
}
