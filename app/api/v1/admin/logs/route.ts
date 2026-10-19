import {
  adminLogListQuerySchema,
  adminLogPageSchema,
  buildAdminLogPage,
  canUseDeveloperTools,
} from "@/domains/admin";
import { getAuditEvents } from "@/domains/admin/server";
import { getUsersByIds } from "@/domains/users/server";

import { handleAdminGet } from "../_lib/admin-route";
import { parseResponse } from "../_lib/response-contract";

/**
 * `GET /api/v1/admin/logs` — one cursor-paginated page of the Admin audit log
 * (spec 11 §46-§52), newest event first, with the page's filters. The Logs
 * screen has been on React Admin since 2026-10-14. PostHog does **not** replace
 * it (the owner's decision of 2026-10-17, spec 27 §1.3: audits stay in Neon), so
 * this endpoint and its screen stay.
 *
 * **Admin and developer** (`canUseDeveloperTools`), as the page always was —
 * spec 11 §4's "selected system logs where appropriate" — and **never a
 * writer**, who authors curriculum but does not read the trail of who changed
 * what. The role is read from the database on every call. Read-only: nothing
 * about an audit event can be changed, so there is no write endpoint at all.
 *
 * The read model is the existing `getAuditEvents`; this bounds and reduces it. A
 * row names its actor (display name, else username, else a short id) and never
 * carries a sign-in id or an email — the old page fell back to the sign-in id,
 * this one does not. The query string is strict (an unknown parameter is a 422)
 * and a cursor that is not one of ours is a 422 in plain words. The two date
 * filters are whole days, both ends inclusive, in UTC.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.logs.list",
    authorize: canUseDeveloperTools,
    load: async (_user, req) => {
      const query = adminLogListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );

      const page = await getAuditEvents({
        actorUserId: query.actor,
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        from: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
        to: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
        limit: query.limit,
        cursor: query.cursor,
      });

      const actors = await getUsersByIds([
        ...new Set(page.items.map((event) => event.actorUserId)),
      ]);

      return parseResponse(adminLogPageSchema, buildAdminLogPage(page, actors));
    },
  });
}
