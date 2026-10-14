import { z } from "zod";

import { ADMIN_USER_LIST_MAX_PAGE_SIZE, USER_ROLES } from "@/domains/users";

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
