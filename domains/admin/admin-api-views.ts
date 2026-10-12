import type { PolyglotUser } from "@/domains/users";

import {
  ADMIN_OVERVIEW_RECORD_ID,
  type AdminCurriculumStatusCounts,
  type AdminMe,
  type AdminOverview,
  type AdminPermissions,
  type AdminResourceAction,
} from "./admin-api-contract";
import {
  canAccessAdminArea,
  canManageCurriculum,
  canPublishCurriculum,
  canUseDeveloperTools,
} from "./authorization";

type RoleSubject = Pick<PolyglotUser, "role">;

/**
 * Pure builders that turn a resolved user into the Admin adapter's response
 * DTOs (spec 26 §5). They exist apart from the route handlers so the
 * role-to-permission projection can be tested without HTTP, and so the
 * handlers stay thin.
 *
 * Every decision here is one of the existing `authorization.ts` predicates —
 * nothing is derived from a second role table.
 */

/**
 * Which React Admin resource/action pairs this user may attempt. Grows one
 * resource per migration unit; a resource that is not listed is not
 * accessible, which is the safe default for one that has not shipped yet.
 */
function resourceAccess(
  subject: RoleSubject,
): Record<string, AdminResourceAction[]> {
  const resources: Record<string, AdminResourceAction[]> = {};
  if (canAccessAdminArea(subject)) {
    // Every Admin-area account has an Overview; what it *contains* is
    // role-branched separately (see `buildAdminOverview`).
    resources.overview = ["show"];
  }
  return resources;
}

export function buildAdminPermissions(subject: RoleSubject): AdminPermissions {
  return {
    canAccessAdminArea: canAccessAdminArea(subject),
    canManageCurriculum: canManageCurriculum(subject),
    canPublishCurriculum: canPublishCurriculum(subject),
    canUseDeveloperTools: canUseDeveloperTools(subject),
    resources: resourceAccess(subject),
  };
}

export function buildAdminMe(user: Pick<PolyglotUser, "id" | "role">): AdminMe {
  return {
    id: user.id,
    role: user.role,
    permissions: buildAdminPermissions(user),
  };
}

/**
 * `curriculum` is only ever filled for an account that may manage
 * curriculum. The caller is expected not to even *query* the counts for
 * anyone else (so restricted data is never read, let alone returned);
 * passing counts for such a user still yields `null`.
 */
export function buildAdminOverview(
  user: Pick<PolyglotUser, "role" | "activeLanguageId">,
  counts: AdminCurriculumStatusCounts | null,
): AdminOverview {
  return {
    id: ADMIN_OVERVIEW_RECORD_ID,
    languageId: user.activeLanguageId,
    curriculum: canManageCurriculum(user) ? counts : null,
  };
}
