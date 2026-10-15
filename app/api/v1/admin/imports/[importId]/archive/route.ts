import {
  adminImportArchiveRequestSchema,
  adminImportCommandResultSchema,
  adminImportPathSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { archiveCurriculumImport } from "@/domains/admin/server";

import { handleAdminMutation } from "../../../_lib/admin-route";
import { parseResponse } from "../../../_lib/response-contract";

/**
 * `POST /api/v1/admin/imports/[importId]/archive` (spec 26 Unit 8) — takes an
 * import out of the normal history (spec 19 §25). It changes history only: the
 * curriculum the import made or changed is untouched, and the import can be
 * restored. An explicit command, never a generic update.
 *
 * **Admin only** (`canPublishCurriculum`), from the database role on every call.
 * Which import is the path (read after authentication, like the body) and who is
 * asking is the session; the body is `{}` and nothing else. The service is
 * naturally idempotent — archiving an archived import is a no-op, not an error —
 * so no idempotency key is needed. Its rate limit, audit event and
 * "no longer exists" answer (a 404) are the service's own.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.imports.archive",
    authorize: canPublishCurriculum,
    body: adminImportArchiveRequestSchema,
    execute: async (user) => {
      const { importId } = adminImportPathSchema.parse(await context.params);
      await archiveCurriculumImport({ importId, actorUserId: user.id });
      return parseResponse(adminImportCommandResultSchema, { importId });
    },
  });
}
