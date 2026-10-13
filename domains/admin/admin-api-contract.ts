import { z } from "zod";

import { USER_ROLES } from "@/domains/users";

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
