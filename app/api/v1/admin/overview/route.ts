import {
  adminOverviewSchema,
  buildAdminOverview,
  canAccessAdminArea,
  canManageCurriculum,
} from "@/domains/admin";
import { getAdminCurriculumStatusCounts } from "@/domains/curriculum/server";

import { handleAdminGet } from "../_lib/admin-route";

/**
 * `GET /api/v1/admin/overview` (spec 26 §5) — the Admin Overview's data:
 * curriculum status counts for the caller's own active language.
 *
 * Any Admin-area role may call it, but the counts are only *read* for an
 * account that can manage curriculum. A developer without the admin role
 * gets `curriculum: null` and the counts query never runs, so restricted
 * data is not merely hidden from the response — it is never fetched.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.overview",
    authorize: canAccessAdminArea,
    load: async (user) => {
      const counts = canManageCurriculum(user)
        ? await getAdminCurriculumStatusCounts(user.activeLanguageId)
        : null;
      return adminOverviewSchema.parse(buildAdminOverview(user, counts));
    },
  });
}
