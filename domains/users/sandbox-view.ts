import { hasRole } from "./role-helpers";
import type { PolyglotUser } from "./user-types";

/**
 * Pure predicate for spec 11's "Open Sandbox" grant. Database-free and
 * exhaustively testable, deliberately: this is the single check standing
 * between an admin session and viewing the application as another user row,
 * so it must be readable in one screen and provable without a database.
 *
 * Both halves matter. The actor must be entitled to the Admin area at all
 * (spec 11 §4 admits `admin` and `developer`), and the target must be a
 * sandbox persona owned by *that* actor — not merely any sandbox, and never
 * a real learner.
 */
export function canViewSandboxAs(
  actor: Pick<PolyglotUser, "id" | "role">,
  target: Pick<PolyglotUser, "isSandbox" | "sandboxOwnerUserId">,
): boolean {
  if (!hasRole(actor, ["admin", "developer"])) return false;
  if (!target.isSandbox) return false;
  return target.sandboxOwnerUserId === actor.id;
}
