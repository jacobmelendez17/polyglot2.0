import {
  adminCurriculumListQuerySchema,
  adminCurriculumPageSchema,
  buildAdminCurriculumPage,
  canManageCurriculum,
} from "@/domains/admin";
import {
  getAdminCurriculumItems,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { AppError } from "@/lib/errors/app-error";

import { handleAdminGet } from "../_lib/admin-route";
import { assertLanguageExists } from "../_lib/language";

/**
 * `GET /api/v1/admin/curriculum` (spec 26 §5) — one cursor-paginated page of
 * the Admin curriculum list, for the caller's chosen language.
 *
 * Admin and writer (`canManageCurriculum`); a developer without the admin
 * role gets 403, exactly as they do for the page. Everything else is the
 * existing `getAdminCurriculumItems` read model — search, filters, ordering,
 * and the keyset cursor are not reimplemented here.
 *
 * What this adds is the boundary the page used to get implicitly from its own
 * URL handling: the query string is parsed strictly (an unsupported `sort`,
 * `page`, or any unknown parameter is a 422, not silently ignored), and a
 * `level` or `group` must actually belong to the requested language — the
 * read model would otherwise answer "nothing matches" for a mismatched pair,
 * hiding what is really a malformed request.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.curriculum.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminCurriculumListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );

      await assertLanguageExists(query.language);

      const [levels, groups] = await Promise.all([
        query.level ? getLevelsByLanguage(query.language) : null,
        query.group ? getVocabularyGroupsByLanguage(query.language) : null,
      ]);
      const levelBelongs = levels?.some((level) => level.id === query.level);
      const groupBelongs = groups?.some((group) => group.id === query.group);
      if (levelBelongs === false || groupBelongs === false) {
        throw new AppError(
          "CURRICULUM_VALIDATION_FAILED",
          "That level or group doesn't belong to the selected language.",
        );
      }

      const page = await getAdminCurriculumItems({
        languageId: query.language,
        levelId: query.level,
        type: query.type,
        status: query.status,
        groupId: query.group,
        search: query.search,
        needs: query.needs,
        limit: query.limit,
        cursor: query.cursor,
      });
      return adminCurriculumPageSchema.parse(buildAdminCurriculumPage(page));
    },
  });
}
