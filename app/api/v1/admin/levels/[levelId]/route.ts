import {
  adminLevelPathSchema,
  adminLevelUpdateRequestSchema,
  adminLevelUpdateResultSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { updateLevel } from "@/domains/admin/server";

import { handleAdminMutation } from "../../_lib/admin-route";

/**
 * `PATCH /api/v1/admin/levels/[levelId]` (spec 26 §5) — changes a level's
 * name, status, or CEFR band. An explicit command, never a generic table
 * update.
 *
 * **Admin only** (`canPublishCurriculum`), re-checked from the database role
 * on every call. Setting `status` to `published` is how a level goes live —
 * it gates the level page, lessons, official decks and the dictionary — so
 * the screen asks for confirmation first; this endpoint just makes sure only
 * an Admin can do it, and the service rate-limits it as a publication.
 *
 * Fields in the body that are left out are left alone; `name` and
 * `cefrLevel` sent as `null` are cleared (see the contract). Nothing in the
 * body can name another level: the one changed is the one in the URL.
 *
 * Like `updateLevelAction`, this is last-write-wins: a level has no version
 * column to check (no schema change in this unit), so two Admins saving the
 * same field at once keep whichever arrived last. The screen narrows that by
 * sending only the fields a person actually changed.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ levelId: string }> },
): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.levels.update",
    authorize: canPublishCurriculum,
    body: adminLevelUpdateRequestSchema,
    execute: async (user, body) => {
      // Read after authentication and authorization, like the body: nobody
      // who is not allowed to change a level learns what a valid id looks like.
      const { levelId } = adminLevelPathSchema.parse(await context.params);
      await updateLevel({
        levelId,
        name: body.name,
        status: body.status,
        cefrLevel: body.cefrLevel,
        idempotencyKey: body.idempotencyKey,
        actorUserId: user.id,
      });
      return adminLevelUpdateResultSchema.parse({ levelId });
    },
  });
}
