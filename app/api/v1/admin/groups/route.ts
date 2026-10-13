import {
  adminGroupCreateRequestSchema,
  adminGroupCreateResultSchema,
  adminGroupListQuerySchema,
  adminGroupListSchema,
  buildAdminGroupList,
  canManageCurriculum,
  canPublishCurriculum,
} from "@/domains/admin";
import { createVocabularyGroup } from "@/domains/admin/server";
import { getVocabularyGroupsByLevel } from "@/domains/curriculum/server";

import { handleAdminGet, handleAdminMutation } from "../_lib/admin-route";
import { assertLanguageExists } from "../_lib/language";
import { assertLevelInLanguage } from "../_lib/level-scope";

/**
 * `GET /api/v1/admin/groups` (spec 26 §5) — one level's vocabulary groups, by
 * position, in every status.
 *
 * Admin **and writer** (`canManageCurriculum`): a writer can read the groups
 * they author into. Adding one is a different command with a stricter guard
 * (`POST`, below).
 *
 * Groups are read one level at a time — a group's position only means
 * something within its level — so `language` and `level` are both required, and
 * the level must belong to the language. The read model is the existing
 * `getVocabularyGroupsByLevel`: one query for one level, never the whole
 * language filtered afterwards. The list is one bounded response and says so
 * (`truncated`) if it ever exceeds the bound.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.groups.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminGroupListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      await assertLanguageExists(query.language);
      await assertLevelInLanguage(query.level, query.language);

      const groups = await getVocabularyGroupsByLevel(query.level);
      return adminGroupListSchema.parse(buildAdminGroupList(groups));
    },
  });
}

/**
 * `POST /api/v1/admin/groups` (spec 26 §5) — adds a group. An explicit
 * command, never a generic "insert a row".
 *
 * **Admin only** (`canPublishCurriculum`), re-checked from the database role
 * on every call: a group is structure, and a writer's page access to it is not
 * authority to create one. The service it calls is the one the Server Action
 * always called — rate limit, idempotency, one `GROUP_CREATED` audit event —
 * and it **appends** the group after the level's last, computing the position
 * itself. The client cannot send one, so it cannot renumber anything.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.groups.create",
    authorize: canPublishCurriculum,
    body: adminGroupCreateRequestSchema,
    execute: async (user, body) => {
      await assertLanguageExists(body.languageId);
      await assertLevelInLanguage(body.levelId, body.languageId);
      const { groupId } = await createVocabularyGroup({
        levelId: body.levelId,
        languageId: body.languageId,
        name: body.name,
        idempotencyKey: body.idempotencyKey,
        actorUserId: user.id,
      });
      return adminGroupCreateResultSchema.parse({ groupId });
    },
  });
}
