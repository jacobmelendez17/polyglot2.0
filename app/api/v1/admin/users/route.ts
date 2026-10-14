import {
  adminUserListQuerySchema,
  adminUserPageSchema,
  buildAdminUserPage,
  canManageUsers,
} from "@/domains/admin";
import { listAdminUsers } from "@/domains/admin/server";

import { handleAdminGet } from "../_lib/admin-route";
import { parseResponse } from "../_lib/response-contract";

/**
 * `GET /api/v1/admin/users` (spec 26 Unit 6) — real accounts, newest first,
 * paged by an opaque cursor, optionally narrowed by a search (a username or
 * display name, or an exact account id).
 *
 * **Admin only** (`canManageUsers`), from the database role, on every call: a
 * writer or developer, who can already enter the console, cannot see who the
 * accounts are. The service counts every read against a budget of its own —
 * listing accounts is itself something to enumerate carefully.
 *
 * What comes back is the read model's sanitized shape, rebuilt field by field
 * and validated against the contract: no Clerk id, no email, no timezone, and
 * never a sandbox persona (there is no parameter to ask for one — `.strict()`
 * makes any parameter this endpoint does not implement a 422).
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.users.list",
    authorize: canManageUsers,
    load: async (user, req) => {
      const query = adminUserListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      const page = await listAdminUsers({
        actorUserId: user.id,
        search: query.search,
        cursor: query.cursor,
        limit: query.limit,
      });
      return parseResponse(adminUserPageSchema, buildAdminUserPage(page));
    },
  });
}
