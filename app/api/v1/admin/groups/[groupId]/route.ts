import {
  adminGroupPathSchema,
  adminGroupUpdateRequestSchema,
  adminGroupUpdateResultSchema,
  canPublishCurriculum,
} from "@/domains/admin";
import { updateVocabularyGroup } from "@/domains/admin/server";

import { handleAdminMutation } from "../../_lib/admin-route";

/**
 * `PATCH /api/v1/admin/groups/[groupId]` (spec 26 §5) — renames a group or
 * changes its status. An explicit command, never a generic table update.
 *
 * **Admin only** (`canPublishCurriculum`), re-checked from the database role
 * on every call. Fields left out are left alone; nothing in the body can name
 * another group, a level, or a position (`.strict()`): moving and ordering
 * groups are not this command — ordering is the specialist reorder tool's.
 *
 * Nothing learner-facing reads a group's own status today (the level's and
 * the items' statuses decide what a learner sees), so changing it is an
 * ordinary mutation, not a publication; archiving is recorded as its own audit
 * event. Like
 * `updateVocabularyGroupAction`, this is last-write-wins — a group has no
 * version column — which the screen narrows by sending only the fields a
 * person changed.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.groups.update",
    authorize: canPublishCurriculum,
    body: adminGroupUpdateRequestSchema,
    execute: async (user, body) => {
      // Read after authentication and authorization, like the body: nobody who
      // is not allowed to change a group learns what a valid id looks like.
      const { groupId } = adminGroupPathSchema.parse(await context.params);
      await updateVocabularyGroup({
        groupId,
        name: body.name,
        status: body.status,
        idempotencyKey: body.idempotencyKey,
        actorUserId: user.id,
      });
      return adminGroupUpdateResultSchema.parse({ groupId });
    },
  });
}
