import {
  adminUserPathSchema,
  adminUserRoleChangeRequestSchema,
  adminUserRoleChangeResultSchema,
  canManageUsers,
} from "@/domains/admin";
import { changeUserRole } from "@/domains/admin/server";

import { handleAdminMutation } from "../../../_lib/admin-route";
import { parseResponse } from "../../../_lib/response-contract";

/**
 * `PATCH /api/v1/admin/users/[userId]/role` (spec 26 Unit 6) — sets one
 * account's single role. An explicit command: never a generic "update a user".
 *
 * **Admin only** (`canManageUsers`), from the database role on every call —
 * and the service checks it again, inside the transaction, under the lock that
 * serializes role changes, because an Admin demoted a moment ago must not
 * complete a change they began as one.
 *
 * The body carries the new role, the version token the Admin last saw
 * (`expectedUpdatedAt`: a changed account is a 409, not an overwrite), an
 * optional reason, and the idempotency key — and nothing else (`.strict()`).
 * Who is asking is the session and who is being changed is the path; neither
 * can be named in the body. The service refuses the rest in words the screen
 * shows: yourself, a sandbox persona or unlinked account, an unchanged role, a
 * stale view, the last Admin. It never touches Clerk: the database role is the
 * authority, and it takes effect on the person's very next request.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.users.change-role",
    authorize: canManageUsers,
    body: adminUserRoleChangeRequestSchema,
    execute: async (user, body) => {
      // Read after authentication and authorization, like the body: nobody who
      // may not do this learns what a valid id looks like.
      const { userId } = adminUserPathSchema.parse(await context.params);
      const result = await changeUserRole({
        actorUserId: user.id,
        targetUserId: userId,
        role: body.role,
        expectedUpdatedAt: body.expectedUpdatedAt,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
      });
      return parseResponse(adminUserRoleChangeResultSchema, result);
    },
  });
}
