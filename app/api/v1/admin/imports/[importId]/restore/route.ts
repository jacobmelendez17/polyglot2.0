import {
  adminImportCommandResultSchema,
  adminImportPathSchema,
  adminImportRestoreRequestSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { unarchiveCurriculumImport } from "@/domains/admin/server";

import { handleAdminMutation } from "../../../_lib/admin-route";
import { parseResponse } from "../../../_lib/response-contract";

/**
 * `POST /api/v1/admin/imports/[importId]/restore` (spec 26 Unit 8) — returns an
 * archived import to the normal history. Same shape and guard as `archive`:
 * Admin only, the import is the path, the body is `{}`, and restoring a restored
 * import is a no-op.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.imports.restore",
    authorize: canPublishCurriculum,
    body: adminImportRestoreRequestSchema,
    execute: async (user) => {
      const { importId } = adminImportPathSchema.parse(await context.params);
      await unarchiveCurriculumImport({ importId, actorUserId: user.id });
      return parseResponse(adminImportCommandResultSchema, { importId });
    },
  });
}
