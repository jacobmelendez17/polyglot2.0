import {
  adminCurriculumBulkMoveRequestSchema,
  adminCurriculumBulkMoveResultSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { bulkMoveItems } from "@/domains/admin/server";

import { handleAdminMutation } from "../../_lib/admin-route";
import { MAX_BULK_COMMAND_BODY_BYTES } from "../../_lib/request-guards";
import { parseResponse } from "../../_lib/response-contract";

/**
 * `POST /api/v1/admin/curriculum/bulk-move` (spec 26 Unit 7) — move several
 * items to a level and/or a group. **Admin only** (`canPublishCurriculum`), from
 * the database role on every call.
 *
 * The body names the language the command acts in; the service refuses the whole
 * batch if any item, or the level or group it is moved to, belongs to another
 * language. Moved items join the end of the new level's order (and so keep
 * `position` and `lesson_priority` in step); one already where it is asked to
 * go is left alone. All-or-nothing, one audit event per moved item, idempotent.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.curriculum.bulk-move",
    authorize: canPublishCurriculum,
    body: adminCurriculumBulkMoveRequestSchema,
    maxBodyBytes: MAX_BULK_COMMAND_BODY_BYTES,
    execute: async (user, body) =>
      parseResponse(
        adminCurriculumBulkMoveResultSchema,
        await bulkMoveItems({
          languageId: body.languageId,
          learningItemIds: body.itemIds,
          levelId: body.levelId,
          vocabularyGroupId: body.groupId,
          idempotencyKey: body.idempotencyKey,
          actorUserId: user.id,
        }),
      ),
  });
}
