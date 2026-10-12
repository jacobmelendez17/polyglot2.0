import {
  adminMeSchema,
  buildAdminMe,
  canAccessAdminArea,
} from "@/domains/admin";

import { handleAdminGet } from "../_lib/admin-route";

/**
 * `GET /api/v1/admin/me` (spec 26 §5) — the caller's own database role and
 * the effective permissions the React Admin UI mirrors. Admin, writer, and
 * developer only; anyone else (including a signed-in learner) gets 403, and
 * no session gets 401.
 *
 * The response is parsed through `adminMeSchema` before it leaves, so the
 * payload can only ever contain the contract's fields — no Clerk id, email,
 * or profile data can ride along by accident.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.me",
    authorize: canAccessAdminArea,
    load: async (user) => adminMeSchema.parse(buildAdminMe(user)),
  });
}
