import {
  adminImportCommandResultSchema,
  adminImportDeleteRequestSchema,
  adminImportPathSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { permanentlyDeleteCurriculumImport } from "@/domains/admin/server";

import { handleAdminMutation } from "../../../_lib/admin-route";
import { parseResponse } from "../../../_lib/response-contract";

/**
 * `POST /api/v1/admin/imports/[importId]/delete` (spec 26 Unit 8) — permanently
 * deletes an *archived* import's history (spec 19 §26): its record, its stored
 * row results and, best effort, its source file. It is history cleanup, not an
 * undo — the curriculum the import made or changed is untouched, and a minimal
 * audit event remains.
 *
 * **Admin only** (`canPublishCurriculum`). The body must carry the exact
 * confirmation the person typed (`DELETE`): the service's own rule is that only
 * an archived import can go, and the endpoint re-checks the confirmation rather
 * than trusting that a dialog enforced it. A second delete of the same import is
 * a 404 ("no longer exists"), which a screen shows as a stale view.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.imports.delete",
    authorize: canPublishCurriculum,
    body: adminImportDeleteRequestSchema,
    execute: async (user) => {
      const { importId } = adminImportPathSchema.parse(await context.params);
      await permanentlyDeleteCurriculumImport({
        importId,
        actorUserId: user.id,
      });
      return parseResponse(adminImportCommandResultSchema, { importId });
    },
  });
}
