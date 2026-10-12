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
