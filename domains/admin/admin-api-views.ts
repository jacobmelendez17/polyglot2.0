import type { PolyglotUser } from "@/domains/users";

import type {
  AdminCurriculumItemsPage,
  CurriculumLevel,
  LevelContentCounts,
  ReviewQueuePage,
} from "@/domains/curriculum";

import {
  ADMIN_OVERVIEW_RECORD_ID,
  LEVEL_LIST_MAX,
  type AdminCurriculumPage,
  type AdminCurriculumStatusCounts,
  type AdminLevelList,
  type AdminReviewPage,
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
  if (canManageCurriculum(subject)) {
    // Browsing the curriculum list and the review queue. Writers may — they
    // can see their own work waiting — while *publishing* from the queue is a
    // separate command (`canPublishCurriculum`), never a resource action here.
    resources.curriculum = ["list"];
    resources.review = ["list"];
    // Levels: a writer may read them, but creating and editing one is
    // structural (spec 26 §6: "level/group structural mutations" are
    // Admin-only), so those actions follow `canPublishCurriculum` — the same
    // predicate the endpoints themselves enforce.
    resources.levels = canPublishCurriculum(subject)
      ? ["list", "create", "edit"]
      : ["list"];
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

/**
 * The service's page, reduced to what the list shows. Dropping the rest
 * (`updatedAt`, ordering `position`, the work-queue flags, `languageId`) is
 * deliberate: a wire DTO should carry what a screen needs, not whatever the
 * read model happens to select.
 */
export function buildAdminCurriculumPage(
  page: AdminCurriculumItemsPage,
): AdminCurriculumPage {
  return {
    items: page.items.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      levelId: item.levelId,
      levelNumber: item.levelNumber,
      itemLabel: item.itemLabel,
      meaningLabel: item.meaningLabel,
      groupId: item.groupId,
      groupName: item.groupName,
    })),
    nextCursor: page.nextCursor,
    hasPreviousPage: page.hasPreviousPage,
    previousCursor: page.previousCursor,
  };
}

/**
 * The review queue's page, reduced to what the screen shows.
 *
 * `authorNameById` is resolved by the caller from `domains/users`; an edit
 * whose author cannot be found reads "Unknown" (as the page always did)
 * rather than leaking an id or blanking the column. A new item has no draft
 * author, so its `authorName` is `null`.
 */
export function buildAdminReviewPage(
  page: ReviewQueuePage,
  authorNameById: ReadonlyMap<string, string>,
): AdminReviewPage {
  return {
    items: page.entries.map((entry) => ({
      id: entry.learningItemId,
      kind: entry.kind,
      itemLabel: entry.itemLabel,
      meaningLabel: entry.meaningLabel,
      levelNumber: entry.levelNumber,
      groupName: entry.groupName,
      authorName: entry.authorUserId
        ? (authorNameById.get(entry.authorUserId) ?? "Unknown")
        : null,
      updatedAt: entry.updatedAt.toISOString(),
      version: entry.version,
    })),
    nextCursor: page.nextCursor,
    hasPreviousPage: page.hasPreviousPage,
    previousCursor: page.previousCursor,
  };
}

const NO_CONTENT: LevelContentCounts = {
  vocabularyItems: 0,
  grammarItems: 0,
  vocabularyGroups: 0,
};

/**
 * A language's levels with what each holds, by level number, bounded at
 * `LEVEL_LIST_MAX` (and saying so when it cut anything off). A level with no
 * entry in `counts` holds nothing — `getLevelContentCountsByLanguage` omits
 * empty levels.
 *
 * Sorted here as well as by the query, so the response never depends on the
 * order a read happened to come back in.
 */
export function buildAdminLevelList(
  levels: readonly CurriculumLevel[],
  counts: ReadonlyMap<string, LevelContentCounts>,
): AdminLevelList {
  const ordered = [...levels].sort((a, b) => a.levelNumber - b.levelNumber);
  return {
    items: ordered.slice(0, LEVEL_LIST_MAX).map((level) => ({
      id: level.id,
      levelNumber: level.levelNumber,
      name: level.name,
      status: level.status,
      cefrLevel: level.cefrLevel,
      ...(counts.get(level.id) ?? NO_CONTENT),
    })),
    truncated: ordered.length > LEVEL_LIST_MAX,
  };
}
