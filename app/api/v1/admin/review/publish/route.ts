import {
  adminReviewPublishRequestSchema,
  adminReviewPublishResultSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { publishItem } from "@/domains/admin/server";

import { handleAdminMutation } from "../../_lib/admin-route";

/**
 * `POST /api/v1/admin/review/publish` (spec 26 §5) — release one queued item
 * to learners. An explicit command, never a generic "update the row".
 *
 * **Admin only** (`canPublishCurriculum`), re-checked here from the database
 * role on every call: a writer may *see* the queue, and a hidden or disabled
 * button is never what stops them publishing. The actor is always the
 * authenticated caller — the body has no user field (and the strict schema
 * rejects one), so nobody can publish "as" someone else.
 *
 * Everything that makes publishing safe is the existing `publishItem`
 * service, called unchanged: the `admin-publish` rate limit, a row lock, the
 * `expectedVersion` check (a stale one is a 409, never a silent overwrite),
 * idempotency (a replay of the same key is answered from the stored result,
 * so a retried request cannot publish twice), exactly one audit event, and
 * cache invalidation — all in one transaction. This handler adds only the
 * HTTP boundary: same-origin, JSON-only, size-capped, strictly validated.
 *
 * Bulk publication is deliberately not reachable here; it stays behind its
 * own supported service semantics (Unit 7).
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.review.publish",
    authorize: canPublishCurriculum,
    body: adminReviewPublishRequestSchema,
    execute: async (user, body) => {
      await publishItem({
        learningItemId: body.itemId,
        expectedVersion: body.expectedVersion,
        idempotencyKey: body.idempotencyKey,
        actorUserId: user.id,
      });
      return adminReviewPublishResultSchema.parse({ itemId: body.itemId });
    },
  });
}
