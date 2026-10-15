import { z } from "zod";

import { CURRICULUM_BULK_ITEM_LIMIT } from "@/domains/curriculum/curriculum-bulk-limits";
import { ADMIN_USER_LIST_MAX_PAGE_SIZE, USER_ROLES } from "@/domains/users";

// Re-exported so a screen can say "up to N" without importing the curriculum domain.
export { CURRICULUM_BULK_ITEM_LIMIT };

/**
 * Wire contract for the Admin HTTP adapter under `/api/v1/admin/*` (spec 26
 * §5). Defined once here and reused by both the route handlers (to build
 * responses) and the React Admin `dataProvider`/`authProvider` (to validate
 * what came back), so the two sides cannot drift apart.
 *
 * Pure and framework-free on purpose: no Next.js, Clerk, database, or React
 * imports, so a `"use client"` module can value-import it without dragging
 * server code into the browser bundle.
 */

/** React Admin's own action vocabulary — what `canAccess({ resource, action })` is asked about. */
export const ADMIN_RESOURCE_ACTIONS = [
  "list",
  "show",
  "create",
  "edit",
  "delete",
] as const;
export type AdminResourceAction = (typeof ADMIN_RESOURCE_ACTIONS)[number];

/**
 * The server's own answer to "what may this person do here?". The booleans
 * are the existing `domains/admin/authorization.ts` predicates evaluated on
 * the database role; `resources` is that same decision projected onto React
 * Admin's resource/action vocabulary so the browser never has to rebuild a
 * role hierarchy of its own. Presentation only — every endpoint re-checks.
 */
export const adminPermissionsSchema = z.object({
  canAccessAdminArea: z.boolean(),
  canManageCurriculum: z.boolean(),
  canPublishCurriculum: z.boolean(),
  canManageUsers: z.boolean(),
  canUseDeveloperTools: z.boolean(),
  resources: z.record(z.string(), z.array(z.enum(ADMIN_RESOURCE_ACTIONS))),
});
export type AdminPermissions = z.infer<typeof adminPermissionsSchema>;

/** `GET /api/v1/admin/me`. No Clerk id, email, or profile data. */
export const adminMeSchema = z.object({
  id: z.string().min(1),
  role: z.enum(USER_ROLES),
  permissions: adminPermissionsSchema,
});
export type AdminMe = z.infer<typeof adminMeSchema>;

/** The one fixed record id of the singleton `overview` resource. */
export const ADMIN_OVERVIEW_RECORD_ID = "current";

export const adminCurriculumStatusCountsSchema = z.object({
  published: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
});
export type AdminCurriculumStatusCounts = z.infer<
  typeof adminCurriculumStatusCountsSchema
>;

/**
 * `GET /api/v1/admin/overview`. `curriculum` is `null` — not zeros — for an
 * account that may not see curriculum data (a developer without the admin
 * role), so "no access" is never confused with "nothing exists yet".
 */
export const adminOverviewSchema = z.object({
  id: z.literal(ADMIN_OVERVIEW_RECORD_ID),
  languageId: z.string().min(1),
  curriculum: adminCurriculumStatusCountsSchema.nullable(),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

/* -------------------------------------------------------------------------- */
/* Curriculum list (spec 26 Unit 2)                                           */
/* -------------------------------------------------------------------------- */

export const CURRICULUM_ITEM_TYPES = ["vocabulary", "grammar"] as const;
export const CURRICULUM_STATUSES = [
  "draft",
  "pending",
  "published",
  "archived",
] as const;
/** Spec 25 §15's editorial work queue. "Has Validation Warning" / "Recently Imported" are deliberately absent: nothing backs them yet. */
export const CURRICULUM_NEEDS_FILTERS = [
  "definition",
  "examples",
  "ipa",
  "pronunciation",
  "synonyms",
  "variations",
  "draft_changes",
  "ready_to_publish",
] as const;

/** What the Admin list shows per page. The server caps any request at `CURRICULUM_LIST_MAX_PAGE_SIZE`. */
export const CURRICULUM_LIST_PAGE_SIZE = 20;
export const CURRICULUM_LIST_MAX_PAGE_SIZE = 100;

/**
 * The one ordering the list supports: level, then curriculum position, then
 * id (`getAdminCurriculumItems`' keyset). React Admin is told this is the
 * sort, and any other sort is refused — a cursor is only meaningful under the
 * ordering that produced it.
 */
export const CURRICULUM_LIST_SORT = {
  field: "curriculum_order",
  order: "ASC",
} as const;

/** Same permissive UUID shape the curriculum domain accepts (its seeded fixture ids are not RFC-4122 versioned). */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

/**
 * `GET /api/v1/admin/curriculum` query string. `language` is required:
 * curriculum browsing is always scoped to exactly one language. `.strict()`
 * means a `sort`, `order`, `page`, or any other parameter this endpoint does
 * not implement is rejected rather than silently ignored.
 */
export const adminCurriculumListQuerySchema = z
  .object({
    language: uuidLike,
    level: uuidLike.optional(),
    type: z.enum(CURRICULUM_ITEM_TYPES).optional(),
    status: z.enum(CURRICULUM_STATUSES).optional(),
    group: uuidLike.optional(),
    search: z.string().trim().min(1).max(200).optional(),
    needs: z.enum(CURRICULUM_NEEDS_FILTERS).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CURRICULUM_LIST_MAX_PAGE_SIZE)
      .default(CURRICULUM_LIST_PAGE_SIZE),
  })
  .strict();
export type AdminCurriculumListQuery = z.infer<
  typeof adminCurriculumListQuerySchema
>;

/** One Admin curriculum row. `status` is the *display* status — a published item with an open draft reads `draft`. */
export const adminCurriculumRowSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CURRICULUM_ITEM_TYPES),
  status: z.enum(CURRICULUM_STATUSES),
  levelId: z.string().min(1),
  levelNumber: z.number().int(),
  itemLabel: z.string(),
  meaningLabel: z.string(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
});
export type AdminCurriculumRow = z.infer<typeof adminCurriculumRowSchema>;

/**
 * A cursor-paginated page: there is deliberately **no total** — an exact
 * count over the curriculum is a full scan, and the service does not
 * provide one. `previousCursor` is `null` both when there is no previous page
 * and when the previous page is the first (which needs no cursor); read it
 * together with `hasPreviousPage`.
 */
export const adminCurriculumPageSchema = z.object({
  items: z.array(adminCurriculumRowSchema),
  nextCursor: z.string().nullable(),
  hasPreviousPage: z.boolean(),
  previousCursor: z.string().nullable(),
});
export type AdminCurriculumPage = z.infer<typeof adminCurriculumPageSchema>;

/* -------------------------------------------------------------------------- */
/* Review queue (spec 26 Unit 3)                                              */
/* -------------------------------------------------------------------------- */

/** A new item awaiting its first publication, or an open edit to an already-published one. */
export const REVIEW_KINDS = ["new", "edit"] as const;

export const REVIEW_LIST_PAGE_SIZE = 20;
export const REVIEW_LIST_MAX_PAGE_SIZE = 100;

/** The queue's single ordering (level, label, id). Any other sort is refused, as for the curriculum list. */
export const REVIEW_LIST_SORT = {
  field: "review_order",
  order: "ASC",
} as const;

/** `GET /api/v1/admin/review`. Strict, like the curriculum list: an unsupported parameter is a 422, not ignored. */
export const adminReviewListQuerySchema = z
  .object({
    language: uuidLike,
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(REVIEW_LIST_MAX_PAGE_SIZE)
      .default(REVIEW_LIST_PAGE_SIZE),
  })
  .strict();
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

/**
 * One thing waiting for an Admin. `id` is the learning item's id (React Admin
 * needs one). `version` is the optimistic-concurrency token the publish
 * command must echo back. `authorName` is a display name only — never an id,
 * email, or Clerk identity — and `null` for a new item (it has no draft author).
 */
export const adminReviewRowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(REVIEW_KINDS),
  itemLabel: z.string(),
  meaningLabel: z.string(),
  levelNumber: z.number().int(),
  groupName: z.string().nullable(),
  authorName: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().min(1),
});
export type AdminReviewRow = z.infer<typeof adminReviewRowSchema>;

export const adminReviewPageSchema = z.object({
  items: z.array(adminReviewRowSchema),
  nextCursor: z.string().nullable(),
  hasPreviousPage: z.boolean(),
  previousCursor: z.string().nullable(),
});
export type AdminReviewPage = z.infer<typeof adminReviewPageSchema>;

/**
 * `POST /api/v1/admin/review/publish` — an explicit command, not a generic
 * update. `expectedVersion` is the version the Admin last saw (a stale one is
 * a 409). `idempotencyKey` is one UUID per *intent*: a retry of the same
 * attempt reuses it and is answered from the stored result instead of
 * publishing twice.
 */
export const adminReviewPublishRequestSchema = z
  .object({
    itemId: uuidLike,
    expectedVersion: z.number().int().min(1),
    idempotencyKey: uuidLike,
  })
  .strict();
export type AdminReviewPublishRequest = z.infer<
  typeof adminReviewPublishRequestSchema
>;

export const adminReviewPublishResultSchema = z.object({
  itemId: z.string().min(1),
});
export type AdminReviewPublishResult = z.infer<
  typeof adminReviewPublishResultSchema
>;

/* -------------------------------------------------------------------------- */
/* Curriculum bulk commands (spec 26 Unit 7)                                  */
/* -------------------------------------------------------------------------- */

/**
 * The items a bulk command acts on: one to `CURRICULUM_BULK_ITEM_LIMIT` ids,
 * each named once (ids are compared without regard to case, as the database
 * does). The limit equals the list's largest page, so no selection made from one
 * page can exceed it; the server refuses more rather than doing unbounded work.
 */
const bulkItemIdsSchema = z
  .array(uuidLike)
  .min(1)
  .max(CURRICULUM_BULK_ITEM_LIMIT)
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    { message: "Each item can be named only once." },
  );

/**
 * `POST /api/v1/admin/curriculum/bulk-publish` — publish several **Pending**
 * items together, all or none. `languageId` names the language the command acts
 * in (every item must belong to it); the actor is the session, never the body.
 * `idempotencyKey` is one UUID per intent: a retry of the same attempt is
 * answered from the stored result instead of publishing twice.
 */
export const adminCurriculumBulkPublishRequestSchema = z
  .object({
    languageId: uuidLike,
    itemIds: bulkItemIdsSchema,
    idempotencyKey: uuidLike,
  })
  .strict();
export type AdminCurriculumBulkPublishRequest = z.infer<
  typeof adminCurriculumBulkPublishRequestSchema
>;
export const adminCurriculumBulkPublishResultSchema = z.object({
  publishedItemIds: z.array(z.string().min(1)),
});
export type AdminCurriculumBulkPublishResult = z.infer<
  typeof adminCurriculumBulkPublishResultSchema
>;

/**
 * `POST /api/v1/admin/curriculum/bulk-archive` — archive several items together,
 * all or none. Items already archived are left as they were and reported back.
 * There is deliberately **no bulk delete**: nothing here destroys content.
 */
export const adminCurriculumBulkArchiveRequestSchema = z
  .object({
    languageId: uuidLike,
    itemIds: bulkItemIdsSchema,
    idempotencyKey: uuidLike,
  })
  .strict();
export type AdminCurriculumBulkArchiveRequest = z.infer<
  typeof adminCurriculumBulkArchiveRequestSchema
>;
export const adminCurriculumBulkArchiveResultSchema = z.object({
  archivedItemIds: z.array(z.string().min(1)),
  alreadyArchivedItemIds: z.array(z.string().min(1)),
});
export type AdminCurriculumBulkArchiveResult = z.infer<
  typeof adminCurriculumBulkArchiveResultSchema
>;

/**
 * `POST /api/v1/admin/curriculum/bulk-move` — move several items to a level
 * and/or a group of the same language, all or none. Moved items join the end of
 * the new level's order. An item already where it is being moved is left alone
 * and reported back.
 */
export const adminCurriculumBulkMoveRequestSchema = z
  .object({
    languageId: uuidLike,
    itemIds: bulkItemIdsSchema,
    levelId: uuidLike.optional(),
    groupId: uuidLike.optional(),
    idempotencyKey: uuidLike,
  })
  .strict()
  .refine(
    (request) => request.levelId !== undefined || request.groupId !== undefined,
    {
      message: "A move must name a level, a group, or both.",
      path: ["levelId"],
    },
  );
export type AdminCurriculumBulkMoveRequest = z.infer<
  typeof adminCurriculumBulkMoveRequestSchema
>;
export const adminCurriculumBulkMoveResultSchema = z.object({
  movedItemIds: z.array(z.string().min(1)),
  unchangedItemIds: z.array(z.string().min(1)),
});
export type AdminCurriculumBulkMoveResult = z.infer<
  typeof adminCurriculumBulkMoveResultSchema
>;

/* -------------------------------------------------------------------------- */
/* Levels (spec 26 Unit 4)                                                    */
/* -------------------------------------------------------------------------- */

/** The band an item page shows in its hero (spec 18); mirrors the `cefr_level` enum. */
export const ADMIN_CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/**
 * A language holds a handful of levels, so the list is one bounded response,
 * not a paged one. The bound exists anyway: a list endpoint is never
 * unbounded, and if a language ever exceeded it the response says so
 * (`truncated`) rather than quietly dropping rows.
 */
export const LEVEL_LIST_MAX = 100;

/**
 * The create command's only upper limit is what PostgreSQL's `integer` column
 * can hold — which is precisely what the Server Action it replaces accepted (it
 * had no maximum, so a huge number reached the database and failed there).
 * The *learner-facing* range is narrower (`LEVEL_NUMBER_MAX` in
 * `domains/curriculum`, 1–50, spec 10): an Admin can create a level that no
 * learner can open. Tightening that is a rule change, not a presentation
 * change, so it is left for the owner (see progress-tracker.md).
 */
const LEVEL_NUMBER_COLUMN_MAX = 2_147_483_647;

/** A name is optional; when present it is trimmed and not empty. The cap is generous — the legacy action had none beyond the request-size limit. */
const levelNameSchema = z.string().trim().min(1).max(200);

/** The one ordering of the levels list: by level number. Any other sort is refused, as for the other lists. */
export const LEVEL_LIST_SORT = {
  field: "level_number",
  order: "ASC",
} as const;

/**
 * `GET /api/v1/admin/levels` query string. `language` is required (levels are
 * read one language at a time) and the schema is `.strict()`: a parameter this
 * endpoint does not implement is a 422, never silently ignored.
 */
export const adminLevelListQuerySchema = z
  .object({ language: uuidLike })
  .strict();
export type AdminLevelListQuery = z.infer<typeof adminLevelListQuerySchema>;

/**
 * One level and what it holds. The counts are information — a level holds any
 * number of any kind of item, and publishing it is an Admin's decision, not a
 * threshold being met (spec 17; no 48/12 gate).
 */
export const adminLevelRowSchema = z.object({
  id: z.string().min(1),
  levelNumber: z.number().int(),
  name: z.string().nullable(),
  status: z.enum(CURRICULUM_STATUSES),
  cefrLevel: z.enum(ADMIN_CEFR_LEVELS).nullable(),
  vocabularyItems: z.number().int().nonnegative(),
  grammarItems: z.number().int().nonnegative(),
  vocabularyGroups: z.number().int().nonnegative(),
});
export type AdminLevelRow = z.infer<typeof adminLevelRowSchema>;

export const adminLevelListSchema = z.object({
  items: z.array(adminLevelRowSchema),
  /** More levels exist than `LEVEL_LIST_MAX`; `items` is the first of them, by level number. */
  truncated: z.boolean(),
});
export type AdminLevelList = z.infer<typeof adminLevelListSchema>;

/**
 * `POST /api/v1/admin/levels` — Admin only. A new level starts as a draft with
 * nothing attached; content is added afterwards. Same rules as the Server
 * Action this replaces: a whole number of at least 1, and an optional name.
 */
export const adminLevelCreateRequestSchema = z
  .object({
    languageId: uuidLike,
    levelNumber: z.number().int().min(1).max(LEVEL_NUMBER_COLUMN_MAX),
    name: levelNameSchema.nullable().optional(),
    idempotencyKey: uuidLike,
  })
  .strict();
export type AdminLevelCreateRequest = z.infer<
  typeof adminLevelCreateRequestSchema
>;

export const adminLevelCreateResultSchema = z.object({
  levelId: z.string().min(1),
});
export type AdminLevelCreateResult = z.infer<
  typeof adminLevelCreateResultSchema
>;

/**
 * `PATCH /api/v1/admin/levels/[levelId]` — Admin only. A field that is
 * **omitted** is left alone; `name` and `cefrLevel` set to **`null`** are
 * cleared; `status` cannot be cleared. At least one field must be present: an
 * update that changes nothing is a mistake, not a request.
 *
 * The level being changed is the one in the URL, and nothing in the body can
 * name another (`.strict()`).
 */
export const adminLevelUpdateRequestSchema = z
  .object({
    name: levelNameSchema.nullable().optional(),
    status: z.enum(CURRICULUM_STATUSES).optional(),
    cefrLevel: z.enum(ADMIN_CEFR_LEVELS).nullable().optional(),
    idempotencyKey: uuidLike,
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.status !== undefined ||
      body.cefrLevel !== undefined,
    { message: "Nothing to change." },
  );
export type AdminLevelUpdateRequest = z.infer<
  typeof adminLevelUpdateRequestSchema
>;

export const adminLevelUpdateResultSchema = z.object({
  levelId: z.string().min(1),
});
export type AdminLevelUpdateResult = z.infer<
  typeof adminLevelUpdateResultSchema
>;

/** The `[levelId]` path segment. */
export const adminLevelPathSchema = z.object({ levelId: uuidLike });

/* -------------------------------------------------------------------------- */
/* Groups (spec 26 Unit 5)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A level holds a handful of groups, so the list is one bounded response, not
 * a paged one — bounded all the same, and saying so (`truncated`) if a level
 * ever exceeded it.
 */
export const GROUP_LIST_MAX = 100;

/**
 * The one ordering of a level's groups: by `position`, which is unique within
 * a level. Any other sort is refused: the position *is* the order (and the
 * lesson number learners see), and persisting it is the specialist reorder
 * tool's job — never a generic list sort.
 */
export const GROUP_LIST_SORT = {
  field: "group_position",
  order: "ASC",
} as const;

/** The longest a group's name may be (after trimming). Generous — the legacy action had none beyond the request-size limit. */
export const GROUP_NAME_MAX = 200;

/** A group's name is required; trimmed and not empty. */
const groupNameSchema = z.string().trim().min(1).max(GROUP_NAME_MAX);

/**
 * `GET /api/v1/admin/groups` query string. Groups are read **one level at a
 * time** — `language` and `level` are both required — because a group's
 * position only means something within its own level. `.strict()`: a
 * parameter this endpoint does not implement is a 422, never ignored.
 */
export const adminGroupListQuerySchema = z
  .object({ language: uuidLike, level: uuidLike })
  .strict();
export type AdminGroupListQuery = z.infer<typeof adminGroupListQuerySchema>;

/** One group of a level. `position` is its place in the level's order. */
export const adminGroupRowSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  name: z.string(),
  status: z.enum(CURRICULUM_STATUSES),
  position: z.number().int(),
});
export type AdminGroupRow = z.infer<typeof adminGroupRowSchema>;

export const adminGroupListSchema = z.object({
  items: z.array(adminGroupRowSchema),
  /** More groups exist than `GROUP_LIST_MAX`; `items` is the first of them, by position. */
  truncated: z.boolean(),
});
export type AdminGroupList = z.infer<typeof adminGroupListSchema>;

/**
 * `POST /api/v1/admin/groups` — Admin only. A new group is appended after
 * every existing group in its level; the **server** computes the position, so
 * there is deliberately no `position` here to send (and `.strict()` refuses
 * one). The level must belong to the language, which the endpoint checks.
 */
export const adminGroupCreateRequestSchema = z
  .object({
    languageId: uuidLike,
    levelId: uuidLike,
    name: groupNameSchema,
    idempotencyKey: uuidLike,
  })
  .strict();
export type AdminGroupCreateRequest = z.infer<
  typeof adminGroupCreateRequestSchema
>;

export const adminGroupCreateResultSchema = z.object({
  groupId: z.string().min(1),
});
export type AdminGroupCreateResult = z.infer<
  typeof adminGroupCreateResultSchema
>;

/**
 * `PATCH /api/v1/admin/groups/[groupId]` — Admin only. A field that is
 * **omitted** is left alone. A name cannot be cleared (a group always has
 * one), so — unlike a level's — `null` is not a value here, and neither is a
 * `position` or a level: moving a group is not this command, and ordering is
 * the specialist reorder tool's. At least one field must be present.
 */
export const adminGroupUpdateRequestSchema = z
  .object({
    name: groupNameSchema.optional(),
    status: z.enum(CURRICULUM_STATUSES).optional(),
    idempotencyKey: uuidLike,
  })
  .strict()
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: "Nothing to change.",
  });
export type AdminGroupUpdateRequest = z.infer<
  typeof adminGroupUpdateRequestSchema
>;

export const adminGroupUpdateResultSchema = z.object({
  groupId: z.string().min(1),
});
export type AdminGroupUpdateResult = z.infer<
  typeof adminGroupUpdateResultSchema
>;

/** The `[groupId]` path segment. */
export const adminGroupPathSchema = z.object({ groupId: uuidLike });

/* -------------------------------------------------------------------------- */
/* Users and roles (spec 26 Unit 6)                                           */
/* -------------------------------------------------------------------------- */

/** What the account list shows per page. The server caps any request at `USER_LIST_MAX_PAGE_SIZE`. */
export const USER_LIST_PAGE_SIZE = 20;
export const USER_LIST_MAX_PAGE_SIZE = ADMIN_USER_LIST_MAX_PAGE_SIZE;

/**
 * The account list's one ordering: newest account first. Creation time never
 * changes, so a role edit cannot move a row while someone pages. Any other
 * sort is refused — a cursor only means something under the order that made it.
 */
export const USER_LIST_SORT = { field: "created_at", order: "DESC" } as const;

/** The longest reason an Admin may give for a role change. Recorded in the audit event. */
export const USER_ROLE_REASON_MAX = 200;

/** The longest search the account list accepts; the screen cuts a longer one rather than send a request the server would refuse. */
export const USER_SEARCH_MAX = 100;

/**
 * An instant as ISO-8601 UTC text, with whatever sub-second precision it has.
 * An account's `updatedAt` is the **version token** of a role change: Postgres
 * keeps microseconds, so it travels as text and is sent back unchanged — a
 * value rounded to milliseconds could never equal the row it came from.
 */
const instant = z.iso.datetime();

/**
 * `GET /api/v1/admin/users` query string. Accounts are found by `search` (a
 * username or display name, or an exact account id) and paged by `cursor`.
 * `.strict()`: a `sort`, a `role` filter, an `includeSandbox` flag, or anything
 * else this endpoint does not implement is a 422, never quietly ignored — in
 * particular there is **no** way to ask for sandbox personas.
 */
export const adminUserListQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(USER_SEARCH_MAX).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(USER_LIST_MAX_PAGE_SIZE)
      .default(USER_LIST_PAGE_SIZE),
  })
  .strict();
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

/**
 * One account, as the Admin console may see it. There is deliberately no Clerk
 * id, no email, no timezone and nothing about learning progress — see
 * `AdminUserRecord`. (A response object that gained a field would have it
 * stripped here, by `parse`, even if a builder forgot to leave it out.)
 */
export const adminUserRowSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
  role: z.enum(USER_ROLES),
  createdAt: instant,
  /** The version token: send it back as `expectedUpdatedAt`. */
  updatedAt: instant,
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

/** A cursor page; like the other lists, no total. Read `previousCursor` with `hasPreviousPage`. */
export const adminUserPageSchema = z.object({
  items: z.array(adminUserRowSchema),
  nextCursor: z.string().nullable(),
  hasPreviousPage: z.boolean(),
  previousCursor: z.string().nullable(),
});
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

/**
 * `PATCH /api/v1/admin/users/[userId]/role` — Admin only. Sets one account's
 * single role. `.strict()`, so the body cannot name an actor, another account,
 * a Clerk id, or anything but these four fields: who is asking is the session,
 * and who is being changed is the path.
 *
 * `expectedUpdatedAt` is the `updatedAt` the Admin last saw for that account;
 * if the account has changed since, the answer is a 409 rather than a silent
 * overwrite. `reason` is optional, and is written to the audit event.
 */
export const adminUserRoleChangeRequestSchema = z
  .object({
    role: z.enum(USER_ROLES),
    expectedUpdatedAt: instant,
    reason: z.string().trim().min(1).max(USER_ROLE_REASON_MAX).optional(),
    idempotencyKey: uuidLike,
  })
  .strict();
export type AdminUserRoleChangeRequest = z.infer<
  typeof adminUserRoleChangeRequestSchema
>;

export const adminUserRoleChangeResultSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(USER_ROLES),
  /** The account's new version token. */
  updatedAt: instant,
});
export type AdminUserRoleChangeResult = z.infer<
  typeof adminUserRoleChangeResultSchema
>;

/** The `[userId]` path segment. */
export const adminUserPathSchema = z.object({ userId: uuidLike });

/* -------------------------------------------------------------------------- */
/* Import history (spec 26 Unit 8)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where an asynchronous curriculum import is in its life (spec 19 §18). Mirrors
 * the `curriculum_import_status` enum — this module cannot import the schema (it
 * is value-imported by the browser), so a unit test keeps the two in step.
 */
export const IMPORT_STATUSES = [
  "uploading",
  "queued_for_preview",
  "previewing",
  "needs_review",
  "ready_to_import",
  "queued_for_import",
  "importing",
  "completed",
  "failed",
] as const;
export type AdminImportStatus = (typeof IMPORT_STATUSES)[number];

/** What the history shows per page. The server caps any request at `IMPORT_LIST_MAX_PAGE_SIZE`. */
export const IMPORT_LIST_PAGE_SIZE = 20;
export const IMPORT_LIST_MAX_PAGE_SIZE = 100;

/**
 * The history's one ordering: newest import first (creation time, then id).
 * Creation never changes, so archiving, confirming or retrying an import cannot
 * move a row while someone pages. Any other sort is refused.
 */
export const IMPORT_LIST_SORT = { field: "created_at", order: "DESC" } as const;

/** What a person types to permanently delete an import's history (spec 19 §26). Case matters. */
export const IMPORT_DELETE_CONFIRMATION = "DELETE";

/**
 * `GET /api/v1/admin/imports` — one language's import history, one state at a
 * time: the normal history (`archived` absent or `false`) or the archived one
 * (`true`). Strict, like the other lists: a status filter, a sort or any other
 * parameter is a 422, since nothing here would honour it.
 */
export const adminImportListQuerySchema = z
  .object({
    language: uuidLike,
    archived: z.enum(["true", "false"]).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(IMPORT_LIST_MAX_PAGE_SIZE)
      .default(IMPORT_LIST_PAGE_SIZE),
  })
  .strict();
export type AdminImportListQuery = z.infer<typeof adminImportListQuerySchema>;

/**
 * One import, as the history shows it: the file's name, where it is, what it
 * found, and when. There is deliberately no storage bucket or key, no checksum,
 * no uploader, and no error text — those belong to the import's own page, which
 * is for someone who may act on it. (A response object that gained a field
 * would have it stripped here by `parse`, even if a builder forgot to leave it
 * out.)
 */
export const adminImportRowSchema = z.object({
  id: z.string().min(1),
  originalFilename: z.string(),
  status: z.enum(IMPORT_STATUSES),
  totalRows: z.number().int().nonnegative(),
  createCount: z.number().int().nonnegative(),
  updateCount: z.number().int().nonnegative(),
  moveCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  /** How many times the import has been attempted — what a failed one says. */
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  /** `null` in the normal history; when the import was archived in the archived one. */
  archivedAt: z.iso.datetime().nullable(),
});
export type AdminImportRow = z.infer<typeof adminImportRowSchema>;

/** A cursor page; like the other lists, no total. Read `previousCursor` with `hasPreviousPage`. */
export const adminImportPageSchema = z.object({
  items: z.array(adminImportRowSchema),
  nextCursor: z.string().nullable(),
  hasPreviousPage: z.boolean(),
  previousCursor: z.string().nullable(),
});
export type AdminImportPage = z.infer<typeof adminImportPageSchema>;

/** The `[importId]` path segment of the three history commands. */
export const adminImportPathSchema = z.object({ importId: uuidLike });

/**
 * `POST /api/v1/admin/imports/[importId]/archive` and `/restore` — Admin only.
 * Neither carries data: which import is the path, who is asking is the session,
 * so the body is `{}` and nothing else (`.strict()`). Both are naturally
 * idempotent in the service (archiving an archived import, or restoring a
 * restored one, is a no-op, not an error), so neither needs an idempotency key.
 */
export const adminImportArchiveRequestSchema = z.object({}).strict();
export type AdminImportArchiveRequest = z.infer<
  typeof adminImportArchiveRequestSchema
>;
export const adminImportRestoreRequestSchema = z.object({}).strict();
export type AdminImportRestoreRequest = z.infer<
  typeof adminImportRestoreRequestSchema
>;

/**
 * `POST /api/v1/admin/imports/[importId]/delete` — Admin only, and only for an
 * archived import. The one field is the confirmation the person typed; the
 * service re-checks it here rather than trusting the dialog (spec 19 §26).
 */
export const adminImportDeleteRequestSchema = z
  .object({ confirmation: z.literal(IMPORT_DELETE_CONFIRMATION) })
  .strict();
export type AdminImportDeleteRequest = z.infer<
  typeof adminImportDeleteRequestSchema
>;

/** The three commands answer with the import they acted on. */
export const adminImportCommandResultSchema = z.object({
  importId: z.string().min(1),
});
export type AdminImportCommandResult = z.infer<
  typeof adminImportCommandResultSchema
>;

/* -------------------------------------------------------------------------- */
/* Dictionary mapping queue (spec 26 Unit 9)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where a curriculum word stands against the imported dictionary (spec 12).
 * Mirrors `DictionaryMatchStatus` — this module cannot import the lexicon's
 * types at runtime without the server graph, so a unit test keeps the lists in
 * step with the labels the lexicon actually defines.
 */
export const MAPPING_MATCH_STATUSES = [
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "review_required",
  "manual",
] as const;
export type AdminMappingMatchStatus = (typeof MAPPING_MATCH_STATUSES)[number];

export const MAPPING_REGIONAL_STATUSES = [
  "recognized",
  "not_listed",
  "unknown",
] as const;
export type AdminMappingRegionalStatus =
  (typeof MAPPING_REGIONAL_STATUSES)[number];

export const MAPPING_CONFIDENCES = ["high", "medium", "low"] as const;

/** Mirrors `MAPPING_REVIEW_REASONS`. */
export const MAPPING_REVIEW_REASON_CODES = [
  "multiple_candidates",
  "part_of_speech_conflict",
  "phrase_ambiguity",
  "selected_sense_missing",
  "entry_missing_from_source",
  "regional_mismatch",
] as const;

/**
 * The parts of speech the queue can be filtered by: the set the curriculum
 * editors actually offer, not a `SELECT DISTINCT` over every item (curriculum
 * stores this as free text, so that list would grow with every typo).
 */
export const MAPPING_PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "phrase",
] as const;

/** What the queue shows per page. The server caps any request at `DICTIONARY_LIST_MAX_PAGE_SIZE` (the lexicon service's own bound). */
export const DICTIONARY_LIST_PAGE_SIZE = 25;
export const DICTIONARY_LIST_MAX_PAGE_SIZE = 100;

/** The queue's one ordering — level, then the group's place in the lesson order, then the word — which is the repository's. Any other sort is refused. */
export const DICTIONARY_LIST_SORT = {
  field: "level_group_term",
  order: "ASC",
} as const;

/**
 * `GET /api/v1/admin/dictionary` query string — the filters the page always
 * had (`language, level, group, status, pos, region, regional`) and where in
 * the queue to start. Strict, like every list: a parameter nothing here honours
 * is a 422, never ignored. This queue pages by `offset` and reports a real
 * `total` (the repository counts, as it always did), unlike the keyset lists.
 */
export const adminDictionaryListQuerySchema = z
  .object({
    language: uuidLike,
    level: uuidLike.optional(),
    group: uuidLike.optional(),
    status: z.enum(MAPPING_MATCH_STATUSES).optional(),
    pos: z.enum(MAPPING_PARTS_OF_SPEECH).optional(),
    region: z.string().trim().min(2).max(16).optional(),
    regional: z.enum(MAPPING_REGIONAL_STATUSES).optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(DICTIONARY_LIST_MAX_PAGE_SIZE)
      .default(DICTIONARY_LIST_PAGE_SIZE),
  })
  .strict();
export type AdminDictionaryListQuery = z.infer<
  typeof adminDictionaryListQuerySchema
>;

/**
 * One curriculum word and where its mapping stands. There is deliberately no
 * dictionary entry id, no source text and no raw import data — the queue finds
 * work; the item's own page holds the mapping panel, which owns every decision
 * about *which* entry, sense or pronunciation is right.
 */
export const adminDictionaryRowSchema = z.object({
  /** The vocabulary item (its learning-item id). */
  id: z.string().min(1),
  displayWord: z.string(),
  translation: z.string(),
  levelNumber: z.number().int(),
  groupName: z.string(),
  lookupForm: z.string().nullable(),
  /** `null`: nothing has looked at the word yet (it has no mapping row). */
  matchStatus: z.enum(MAPPING_MATCH_STATUSES).nullable(),
  confidence: z.enum(MAPPING_CONFIDENCES).nullable(),
  reviewReason: z.enum(MAPPING_REVIEW_REASON_CODES).nullable(),
  /** The mapping is locked against automatic replacement (an Admin or writer chose it). */
  manualLock: z.boolean(),
  entryLemma: z.string().nullable(),
  entryPartOfSpeech: z.string().nullable(),
  /** Whether a batch confirmation may include it: it has a candidate, and is not confirmed already. */
  confirmable: z.boolean(),
  regionalStatus: z.enum(MAPPING_REGIONAL_STATUSES).nullable(),
});
export type AdminDictionaryRow = z.infer<typeof adminDictionaryRowSchema>;

export const adminDictionaryCountsSchema = z.object({
  unmatched: z.number().int().nonnegative(),
  source_data_not_imported: z.number().int().nonnegative(),
  auto_matched: z.number().int().nonnegative(),
  review_required: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  /** Words nothing has ever looked at. */
  no_mapping: z.number().int().nonnegative(),
});
export type AdminDictionaryCounts = z.infer<typeof adminDictionaryCountsSchema>;

export const adminDictionaryPageSchema = z.object({
  items: z.array(adminDictionaryRowSchema),
  /** How many words match the filters — the whole queue, not this page. */
  total: z.number().int().nonnegative(),
  /** Every status's size for the language, whatever the filters (the header's numbers). */
  counts: adminDictionaryCountsSchema,
  /** The region the regional column and filter refer to; `null` when the language has none. */
  regionCode: z.string().nullable(),
  /** The regions the language's dictionary can speak to, for the filter. */
  regionCodes: z.array(z.string()),
});
export type AdminDictionaryPage = z.infer<typeof adminDictionaryPageSchema>;

/* -------------------------------------------------------------------------- */
/* Official decks (spec 26 Unit 10)                                           */
/* -------------------------------------------------------------------------- */

/**
 * A language has a handful of official decks, so the list is one bounded
 * response, not a paged one — the same shape as the levels list, with the same
 * honesty: if a language ever exceeded the bound the response says so
 * (`truncated`) instead of quietly dropping decks.
 */
export const DECK_LIST_MAX = 100;

/** The one ordering of the decks list: by name (the repository's, then id). Any other sort is refused. */
export const DECK_LIST_SORT = { field: "name", order: "ASC" } as const;

export const DECK_AVAILABILITIES = ["theme", "level"] as const;
export type AdminDeckAvailability = (typeof DECK_AVAILABILITIES)[number];

/**
 * `GET /api/v1/admin/decks` query string. `language` is required (decks are
 * read one language at a time) and the schema is `.strict()`. There is no
 * `kind` parameter and never will be: **only official Polyglot decks are
 * listed**; a learner's personal deck is private and has no administrative
 * surface at all.
 */
export const adminDeckListQuerySchema = z
  .object({ language: uuidLike })
  .strict();
export type AdminDeckListQuery = z.infer<typeof adminDeckListQuerySchema>;

/**
 * One official deck, as the list shows it. No owner, no item ids — the deck's
 * own page holds its membership and order.
 */
export const adminDeckRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  /** `theme`: it reveals as the learner learns its items; `level`: hidden until the gate level. */
  availability: z.enum(DECK_AVAILABILITIES),
  gateLevelNumber: z.number().int().nullable(),
});
export type AdminDeckRow = z.infer<typeof adminDeckRowSchema>;

export const adminDeckListSchema = z.object({
  items: z.array(adminDeckRowSchema),
  /** More decks exist than `DECK_LIST_MAX`; `items` is the first of them, by name. */
  truncated: z.boolean(),
});
export type AdminDeckList = z.infer<typeof adminDeckListSchema>;

/**
 * Error codes this adapter can answer with, and the HTTP status each maps
 * to (spec 26 §3 "API errors"). Domain errors (`AppError`/`AdminError`)
 * are translated onto these at the route boundary.
 */
export const ADMIN_API_ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;
export type AdminApiErrorCode = keyof typeof ADMIN_API_ERROR_STATUS;

export const adminApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
  }),
});
export type AdminApiErrorBody = z.infer<typeof adminApiErrorSchema>;
