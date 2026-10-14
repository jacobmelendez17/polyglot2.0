import {
  adminCurriculumBulkPublishRequestSchema,
  adminCurriculumBulkPublishResultSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { bulkPublishPendingItems } from "@/domains/admin/server";

import { handleAdminMutation } from "../../_lib/admin-route";
import { MAX_BULK_COMMAND_BODY_BYTES } from "../../_lib/request-guards";
import { parseResponse } from "../../_lib/response-contract";

/**
 * `POST /api/v1/admin/curriculum/bulk-publish` (spec 26 Unit 7) — release
 * several **Pending** items to learners together. An explicit command, never a
 * generic "update these rows".
 *
 * **Admin only** (`canPublishCurriculum`), from the database role on every call:
 * a writer sees the list but is refused here, and a hidden or disabled button is
 * never what stops them. The actor is the authenticated caller — the strict body
 * has no user field.
 *
 * Everything that makes this safe is the existing `bulkPublishPendingItems`
 * service, called as it is: the `admin-publish` rate limit, every row locked up
 * front, all-or-nothing (one item no longer Pending refuses the whole batch with
 * a 409 — nothing is half-published), one audit event per item sharing the
 * request's correlation id, and idempotency (a retry of the same key is answered
 * from the stored result). This handler adds the HTTP boundary only: same-origin,
 * JSON-only, size-capped, strictly validated, bounded to the bulk item limit.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.curriculum.bulk-publish",
    authorize: canPublishCurriculum,
    body: adminCurriculumBulkPublishRequestSchema,
    maxBodyBytes: MAX_BULK_COMMAND_BODY_BYTES,
    execute: async (user, body) =>
      parseResponse(
        adminCurriculumBulkPublishResultSchema,
        await bulkPublishPendingItems({
          languageId: body.languageId,
          learningItemIds: body.itemIds,
          idempotencyKey: body.idempotencyKey,
          actorUserId: user.id,
        }),
      ),
  });
}
