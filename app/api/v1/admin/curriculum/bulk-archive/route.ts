import {
  adminCurriculumBulkArchiveRequestSchema,
  adminCurriculumBulkArchiveResultSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { bulkArchiveItems } from "@/domains/admin/server";

import { handleAdminMutation } from "../../_lib/admin-route";
import { MAX_BULK_COMMAND_BODY_BYTES } from "../../_lib/request-guards";
import { parseResponse } from "../../_lib/response-contract";

/**
 * `POST /api/v1/admin/curriculum/bulk-archive` (spec 26 Unit 7) — take several
 * items out of learners' sight together. **Admin only** (`canPublishCurriculum`),
 * from the database role on every call.
 *
 * Archiving is not deleting: nothing is destroyed here, and there is no bulk
 * delete (spec 11: "do not add broad unsafe bulk permanent-delete behavior").
 * The existing `bulkArchiveItems` service does the work — the `admin-mutation`
 * rate limit, every row locked up front, all-or-nothing, one audit event per
 * item sharing the request's correlation id, idempotency — and an item that is
 * already archived is left alone and reported back rather than archived twice.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.curriculum.bulk-archive",
    authorize: canPublishCurriculum,
    body: adminCurriculumBulkArchiveRequestSchema,
    maxBodyBytes: MAX_BULK_COMMAND_BODY_BYTES,
    execute: async (user, body) =>
      parseResponse(
        adminCurriculumBulkArchiveResultSchema,
        await bulkArchiveItems({
          languageId: body.languageId,
          learningItemIds: body.itemIds,
          idempotencyKey: body.idempotencyKey,
          actorUserId: user.id,
        }),
      ),
  });
}
