import { z } from "zod";

import type { DbClient } from "@/db/client";
import { withIdempotency } from "@/domains/idempotency/with-idempotency";
import {
  countRealAdmins,
  getRoleChangeTarget,
  getUserRole,
  lockRoleChanges,
  setUserRole,
} from "@/domains/users/admin-user-repository";
import { USER_ROLES, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

import { recordAuditEvent } from "./audit-repository";

/**
 * Changing another real account's role (spec 26 Unit 6) — the one place the
 * console assigns roles. The rules live here, in the domain, so the HTTP
 * route, a future Server Action and the tests all meet the same ones; the
 * route only parses, authorizes and answers.
 *
 * **One transaction does everything**, and its first act is to take the lock
 * that serializes every role change. Under that lock, in this order:
 *
 * 1. the person asking must **still** be an Admin — the route checked a moment
 *    ago, but a concurrent change may have demoted them since, and a demoted
 *    Admin must not complete a change they began as one;
 * 2. the target must exist and be a **real** account (a Clerk identity, not a
 *    sandbox persona);
 * 3. it must not be **the person asking** — no self-promotion, no self-demotion;
 * 4. the caller's version token must still match the row — two Admins cannot
 *    silently overwrite each other;
 * 5. the role must actually change;
 * 6. an Admin may not be demoted if they are the **last** real one;
 * 7. then the role is updated and `USER_ROLE_CHANGED` is written — **in the
 *    same transaction**, so a role never changes without a trace, nor leaves a
 *    trace of a change that did not happen.
 *
 * Each refusal is its own error code, so the screen can say what is wrong in
 * words. Nothing here touches Clerk: the database role is the authority, and
 * it takes effect on the person's very next request, because every server
 * check reads it fresh.
 */

const MAX_REASON_LENGTH = 200;

/** The permissive UUID shape Postgres accepts (seeded fixture ids are not RFC-4122 versioned, which `z.uuid()` would refuse). A malformed id must be a validation failure here, not a database error. */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

const changeUserRoleInputSchema = z.object({
  actorUserId: uuidLike,
  targetUserId: uuidLike,
  role: z.enum(USER_ROLES),
  expectedUpdatedAt: z.iso.datetime(),
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH).optional(),
  idempotencyKey: z.string().min(1),
});

export type ChangeUserRoleInput = z.input<typeof changeUserRoleInputSchema>;

export type ChangeUserRoleResult = {
  userId: string;
  role: UserRole;
  /** The account's new version token. */
  updatedAt: string;
};

/**
 * The change itself, inside a transaction the caller already holds. Exposed
 * (rather than private) so a test can hold one such transaction open while a
 * second one waits on the lock — the only honest way to show that serialization
 * is real and not luck.
 */
export async function applyUserRoleChange(
  tx: DbClient,
  rawInput: ChangeUserRoleInput,
): Promise<ChangeUserRoleResult> {
  const input = changeUserRoleInputSchema.parse(rawInput);

  await lockRoleChanges(tx);

  // 1. Authorization, re-verified under the lock.
  if ((await getUserRole(tx, input.actorUserId)) !== "admin") {
    throw new AppError("FORBIDDEN");
  }

  // 2. A real target.
  const target = await getRoleChangeTarget(
    tx,
    input.targetUserId,
    input.expectedUpdatedAt,
  );
  if (!target) throw new AdminError("USER_NOT_FOUND");
  if (target.isSandbox || !target.hasClerkIdentity) {
    throw new AdminError(
      "USER_ROLE_CHANGE_NOT_ALLOWED",
      "Only real, signed-up accounts can be given a role here.",
    );
  }

  // 3. Not yourself.
  if (target.id === input.actorUserId) {
    throw new AdminError(
      "USER_ROLE_CHANGE_NOT_ALLOWED",
      "You can't change your own role. Ask another Admin.",
    );
  }

  // 4. Not stale.
  if (!target.versionMatches) {
    throw new AdminError(
      "ADMIN_EDIT_CONFLICT",
      "This account changed after you opened the list. Reload to see its current role, then try again.",
    );
  }

  // 5. Something to change.
  if (target.role === input.role) {
    throw new AdminError(
      "USER_ROLE_CHANGE_NOT_ALLOWED",
      "That person already has that role.",
    );
  }

  // 6. Never the last Admin. Counted under the same lock as the update.
  if (target.role === "admin" && (await countRealAdmins(tx)) <= 1) {
    throw new AdminError("LAST_ADMIN");
  }

  // 7. The change and its audit event, together.
  const updated = await setUserRole(tx, target.id, input.role);
  await recordAuditEvent(tx, {
    actorUserId: input.actorUserId,
    action: "USER_ROLE_CHANGED",
    resourceType: "user",
    resourceId: target.id,
    beforeData: { role: target.role },
    afterData: { role: updated.role },
    reason: input.reason ?? null,
    correlationId: input.idempotencyKey,
  });

  // The role effect, in the operational log: who, to whom, from what to what —
  // ids and roles only, never a name, an email, or a Clerk id.
  logger.info({
    event: "admin.user_role_changed",
    actorUserId: input.actorUserId,
    targetUserId: target.id,
    fromRole: target.role,
    toRole: updated.role,
  });

  return {
    userId: target.id,
    role: updated.role,
    updatedAt: updated.updatedAt,
  };
}

/**
 * The command: idempotent (the key row commits or rolls back with the role
 * change), and one transaction from the lock to the audit event. Takes an
 * injected `DbClient`; `admin-mutation-service.ts` binds the real database and
 * the rate limit.
 */
export async function changeUserRole(
  db: DbClient,
  rawInput: ChangeUserRoleInput,
): Promise<ChangeUserRoleResult> {
  const input = changeUserRoleInputSchema.parse(rawInput);
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.users.change-role",
      key: input.idempotencyKey,
      payload: {
        targetUserId: input.targetUserId,
        role: input.role,
        expectedUpdatedAt: input.expectedUpdatedAt,
        reason: input.reason,
      },
    },
    (tx) => applyUserRoleChange(tx, input),
  );
}

export type ChangeUserRoleServiceInput = ChangeUserRoleInput;
