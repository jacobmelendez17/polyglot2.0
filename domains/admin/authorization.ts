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

/** Can this user enter the Admin area at all? Admin and developer only (spec 11 §4). */
export function canAccessAdminArea(user: Pick<PolyglotUser, "role">): boolean {
  return hasRole(user, ["admin", "developer"]);
}

/**
 * Can this user create, edit, move, archive, or import official curriculum?
 * Admin only — a developer without the admin role cannot, even to browse
 * (spec 11 §4: "A developer cannot modify official curriculum unless that
 * account also has the admin role", and the developer's permitted-surface
 * list never mentions curriculum browsing either).
 */
export function canManageCurriculum(user: Pick<PolyglotUser, "role">): boolean {
  return hasRole(user, "admin");
}
