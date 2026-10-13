import {
  adminLevelCreateRequestSchema,
  adminLevelCreateResultSchema,
  adminLevelListQuerySchema,
  adminLevelListSchema,
  buildAdminLevelList,
  canManageCurriculum,
  canPublishCurriculum,
} from "@/domains/admin";
import { createLevel } from "@/domains/admin/server";
import {
  getLevelContentCountsByLanguage,
  getLevelsByLanguage,
} from "@/domains/curriculum/server";

import { handleAdminGet, handleAdminMutation } from "../_lib/admin-route";
import { assertLanguageExists } from "../_lib/language";

/**
 * `GET /api/v1/admin/levels` (spec 26 §5) — every level of one language, with
 * what each holds.
 *
 * Admin **and writer** (`canManageCurriculum`): a writer can read the levels
 * they author into. Creating one is a different command with a stricter guard
 * (`POST`, below).
 *
 * The read model is the existing `getLevelsByLanguage`; the counts come from
 * one grouped query (`getLevelContentCountsByLanguage`) instead of three per
 * level, and mean exactly what `getLevelContentCounts` means. The list is one
 * bounded response — a language has a handful of levels — and says so
 * (`truncated`) if it ever exceeds the bound.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.levels.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminLevelListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      await assertLanguageExists(query.language);

      const [levels, counts] = await Promise.all([
        getLevelsByLanguage(query.language),
        getLevelContentCountsByLanguage(query.language),
      ]);
      return adminLevelListSchema.parse(buildAdminLevelList(levels, counts));
    },
  });
}

/**
 * `POST /api/v1/admin/levels` (spec 26 §5) — adds a level. An explicit
 * command, never a generic "insert a row".
 *
 * **Admin only** (`canPublishCurriculum`), re-checked from the database role
 * on every call: a level is structure, and a writer's page access to it is not
 * authority to create one. The service it calls is the one the Server Action
 * always called — rate limit, idempotency, one `LEVEL_CREATED` audit event, and
 * a clear refusal for a level number the language already has. A new level
 * starts as a draft with nothing attached.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAdminMutation(request, {
    route: "admin.levels.create",
    authorize: canPublishCurriculum,
    body: adminLevelCreateRequestSchema,
    execute: async (user, body) => {
      await assertLanguageExists(body.languageId);
      const { levelId } = await createLevel({
        languageId: body.languageId,
        levelNumber: body.levelNumber,
        name: body.name ?? null,
        idempotencyKey: body.idempotencyKey,
        actorUserId: user.id,
      });
      return adminLevelCreateResultSchema.parse({ levelId });
    },
  });
}
