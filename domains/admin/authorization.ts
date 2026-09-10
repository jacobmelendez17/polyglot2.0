import { hasRole } from "@/domains/users";
import type { PolyglotUser } from "@/domains/users";

/**
 * Pure, database-free Admin permission predicates (spec 11 §4). Kept
 * separate from `domains/users`' generic `hasRole` so the Admin permission
 * model — which routes/actions map to which roles — lives in exactly one
 * place rather than being re-derived at each call site.
 *
 * These return booleans only; they never throw and never depend on Next.js.
 * Callers in `app/(admin)/**` translate a `false` result into `forbidden()`
 * (spec 11 §5 requires the check to happen server-side on every route, not
 * just once at the layout).
 */

/** Can this user enter the Admin area at all? Admin, developer, and writer (spec 11 §4, extended by spec 17) — each sees a different part of it. */
export function canAccessAdminArea(user: Pick<PolyglotUser, "role">): boolean {
  return hasRole(user, ["admin", "developer", "writer"]);
}

/**
 * Can this user **author** official curriculum — create items, edit them,
 * save drafts, move and reorder them, and work with dictionary mappings?
 *
 * Admin and writer (spec 17). A developer without the admin role cannot,
 * even to browse (spec 11 §4: "A developer cannot modify official curriculum
 * unless that account also has the admin role", and the developer's
 * permitted-surface list never mentions curriculum browsing either).
 *
 * Authoring is safe to delegate precisely because it cannot reach a learner
 * on its own: a new item is `pending` and an edit to a published item is a
 * draft, and only `canPublishCurriculum` releases either.
 */
export function canManageCurriculum(user: Pick<PolyglotUser, "role">): boolean {
  return hasRole(user, ["admin", "writer"]);
}

/**
 * Can this user make curriculum **live**, or take it away — publish, bulk
 * publish, archive, delete, manage levels and groups, or run a bulk import?
 *
 * Admin only (spec 17: "Admin must verify changes for everything"). This is
 * the boundary that makes a writer's work reviewable rather than merely
 * audited: everything they do waits here.
 */
export function canPublishCurriculum(user: Pick<PolyglotUser, "role">): boolean {
  return hasRole(user, "admin");
}

/**
 * Can this user reach the Sandbox and the operational logs? Admin and
 * developer — a writer authors content and has no business simulating
 * learners or reading the audit log.
 */
export function canUseDeveloperTools(user: Pick<PolyglotUser, "role">): boolean {
  return hasRole(user, ["admin", "developer"]);
}
