import type { AdminUsersPage, PolyglotUser } from "@/domains/users";

import type { CurriculumImportsPage } from "./curriculum-import-types";
import type { MappingQueuePage } from "@/domains/lexicon";

import type {
  AdminCurriculumItemsPage,
  CurriculumLevel,
  CurriculumVocabularyGroup,
  LevelContentCounts,
  ReviewQueuePage,
} from "@/domains/curriculum";

import {
  ADMIN_OVERVIEW_RECORD_ID,
  DECK_LIST_MAX,
  GROUP_LIST_MAX,
  LEVEL_LIST_MAX,
  type AdminCurriculumPage,
  type AdminCurriculumStatusCounts,
  type AdminDeckList,
  type AdminDictionaryCounts,
  type AdminDictionaryPage,
  type AdminGroupList,
  type AdminImportPage,
  type AdminLevelList,
  type AdminReviewPage,
  type AdminUserPage,
  type AdminMe,
  type AdminOverview,
  type AdminPermissions,
  type AdminResourceAction,
} from "./admin-api-contract";
import {
  canAccessAdminArea,
  canManageCurriculum,
  canManageUsers,
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
    // Groups follow the same rule, for the same reason (spec 26 §6): a writer
    // reads a level's groups; adding, renaming, archiving and reordering them
    // is structure, so it is Admin-only. `edit` stands for reordering as well —
    // the specialist tool is reached by a link only someone who may edit sees.
    resources.groups = canPublishCurriculum(subject)
      ? ["list", "create", "edit"]
      : ["list"];
    // The import history (spec 26 Unit 8): a writer may read it, but starting
    // an import (`create`), archiving or restoring one (`edit`) and permanently
    // deleting its history (`delete`) are Admin-only (spec 26 §6: "imports").
    resources.imports = canPublishCurriculum(subject)
      ? ["list", "create", "edit", "delete"]
      : ["list"];
    // The dictionary mapping queue (spec 26 Unit 9): finding work and confirming
    // reviewed mappings are authoring, so a writer has both (`edit` is the
    // confirmation — the same `canManageCurriculum` the Server Actions check).
    // Nothing in it publishes: a confirmed mapping reaches a published item as a
    // draft, and releasing that is `canPublishCurriculum`'s review queue.
    resources.dictionary = ["list", "edit"];
  }
  if (canPublishCurriculum(subject)) {
    // Official decks (spec 26 Unit 10) are an Admin's end to end — reading the
    // list included, as the page always was (spec 11 §4: "Official decks
    // management"). For a writer the resource is absent, not an empty list.
    resources.decks = ["list", "create", "edit", "delete"];
  }
  if (canManageUsers(subject)) {
    // Spec 26 Unit 6. The `users` resource exists only for an Admin: for anyone
    // else it is absent, not an empty list, so "no access" is never confused with
    // "no accounts". `edit` is changing a role — the only change there is.
    resources.users = ["list", "edit"];
  }
  return resources;
}

export function buildAdminPermissions(subject: RoleSubject): AdminPermissions {
  return {
    canAccessAdminArea: canAccessAdminArea(subject),
    canManageCurriculum: canManageCurriculum(subject),
    canPublishCurriculum: canPublishCurriculum(subject),
    canManageUsers: canManageUsers(subject),
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

/**
 * One level's groups, by position (then id, so the order is total even if two
 * rows ever shared one), bounded at `GROUP_LIST_MAX` and saying so when it cut
 * anything off. Sorted here as well as by the query, so the response never
 * depends on the order a read happened to come back in.
 */
export function buildAdminGroupList(
  groups: readonly CurriculumVocabularyGroup[],
): AdminGroupList {
  const ordered = [...groups].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  return {
    items: ordered.slice(0, GROUP_LIST_MAX).map((group) => ({
      id: group.id,
      levelId: group.levelId,
      name: group.name,
      status: group.status,
      position: group.position,
    })),
    truncated: ordered.length > GROUP_LIST_MAX,
  };
}

/**
 * The account page, reduced to exactly what the console may show — field by
 * field, never a spread, so a column added to the read model tomorrow reaches
 * the wire only when someone adds it here on purpose. The route validates the
 * result against `adminUserPageSchema` as well, which would strip it anyway.
 */
export function buildAdminUserPage(page: AdminUsersPage): AdminUserPage {
  return {
    items: page.items.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
    nextCursor: page.nextCursor,
    hasPreviousPage: page.hasPreviousPage,
    previousCursor: page.previousCursor,
  };
}

/**
 * The import history's page, reduced to what the list shows — field by field,
 * never a spread, so a column added to the import record tomorrow (it already
 * holds a storage bucket and key, a checksum, an uploader and error text)
 * reaches the wire only when someone adds it here on purpose. The route
 * validates the result against `adminImportPageSchema` as well, which would
 * strip it anyway.
 */
export function buildAdminImportPage(
  page: CurriculumImportsPage,
): AdminImportPage {
  return {
    items: page.items.map((record) => ({
      id: record.id,
      originalFilename: record.originalFilename,
      status: record.status,
      totalRows: record.totalRows,
      createCount: record.createCount,
      updateCount: record.updateCount,
      moveCount: record.moveCount,
      unchangedCount: record.unchangedCount,
      reviewCount: record.reviewCount,
      skippedCount: record.skippedCount,
      attemptCount: record.attemptCount,
      createdAt: record.createdAt.toISOString(),
      archivedAt: record.archivedAt?.toISOString() ?? null,
    })),
    nextCursor: page.nextCursor,
    hasPreviousPage: page.hasPreviousPage,
    previousCursor: page.previousCursor,
  };
}

/**
 * The dictionary mapping queue's page (spec 26 Unit 9), reduced to what the
 * queue shows — field by field. The repository's row carries the dictionary
 * entry's id and the curriculum's part of speech; the queue needs neither (the
 * item's own page holds the mapping panel that decides which entry is right),
 * so neither reaches the wire. `confirmable` is decided here, once, from the
 * rule the batch confirmation itself relies on: there is a candidate to
 * confirm, and it is not confirmed already.
 */
export function buildAdminDictionaryPage(input: {
  page: MappingQueuePage;
  counts: Record<
    | "unmatched"
    | "source_data_not_imported"
    | "auto_matched"
    | "review_required"
    | "manual"
    | "no_mapping",
    number
  >;
  regionCode: string | null;
  regionCodes: readonly string[];
}): AdminDictionaryPage {
  const { page, counts } = input;
  const exactCounts: AdminDictionaryCounts = {
    unmatched: counts.unmatched,
    source_data_not_imported: counts.source_data_not_imported,
    auto_matched: counts.auto_matched,
    review_required: counts.review_required,
    manual: counts.manual,
    no_mapping: counts.no_mapping,
  };
  return {
    items: page.rows.map((row) => ({
      id: row.vocabularyItemId,
      displayWord: row.displayWord,
      translation: row.translation,
      levelNumber: row.levelNumber,
      groupName: row.groupName,
      lookupForm: row.lookupForm,
      matchStatus: row.matchStatus,
      confidence: row.confidence,
      reviewReason: row.reviewReason,
      manualLock: row.manualLock,
      entryLemma: row.entryLemma,
      entryPartOfSpeech: row.entryPartOfSpeech,
      confirmable: row.entryId !== null && row.matchStatus !== "manual",
      regionalStatus: row.regionalStatus,
    })),
    total: page.total,
    counts: exactCounts,
    regionCode: input.regionCode,
    regionCodes: [...input.regionCodes],
  };
}

/** What the decks list needs of an official deck — never its owner, never its items. */
type DeckListSource = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  availability: "theme" | "level";
  gateLevelNumber: number | null;
};

/**
 * The official decks of one language, by name (then id, so the order is total),
 * bounded at `DECK_LIST_MAX` and saying so when it cut anything off. Built field
 * by field: the deck record carries its owner and its gate level's id, which a
 * list of *official* decks has no business sending.
 */
export function buildAdminDeckList(
  decks: readonly DeckListSource[],
): AdminDeckList {
  const ordered = [...decks].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  return {
    items: ordered.slice(0, DECK_LIST_MAX).map((deck) => ({
      id: deck.id,
      name: deck.name,
      description: deck.description,
      itemCount: deck.itemCount,
      availability: deck.availability,
      gateLevelNumber: deck.gateLevelNumber,
    })),
    truncated: ordered.length > DECK_LIST_MAX,
  };
}
