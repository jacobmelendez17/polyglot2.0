import {
  adminDictionaryListQuerySchema,
  adminDictionaryPageSchema,
  buildAdminDictionaryPage,
  canManageCurriculum,
} from "@/domains/admin";
import { getLexicalLanguageProvider } from "@/domains/lexicon";
import {
  getMappingQueue,
  getMappingStatusCounts,
} from "@/domains/lexicon/server";
import { AppError } from "@/lib/errors/app-error";

import { handleAdminGet } from "../_lib/admin-route";
import { assertGroupInLanguage } from "../_lib/group-scope";
import { requireLanguage } from "../_lib/language";
import { assertLevelInLanguage } from "../_lib/level-scope";
import { parseResponse } from "../_lib/response-contract";

/**
 * `GET /api/v1/admin/dictionary` (spec 26 Unit 9) — one page of the dictionary
 * mapping queue: how each curriculum word stands against the imported
 * dictionary, filtered, with the status counts for the language.
 *
 * Admin **and writer** (`canManageCurriculum`), as the queue's page always was:
 * a writer finds and confirms mappings. It is **read-only**; the commands that
 * decide a mapping (which entry, which senses, which pronunciation, a manual
 * choice) are the item page's mapping panel, and confirming reviewed rows in a
 * batch is the existing `bulkConfirmVocabularyMappingsAction`.
 *
 * The read model is the existing `getMappingQueue` / `getMappingStatusCounts`
 * and nothing else. A word is listed only if it is *vocabulary* of the named
 * language — grammar has no dictionary mapping, and another language's words
 * never appear: `level` and `group` must belong to the language (a 422
 * otherwise), `region` must be one its dictionary covers, and the language must
 * exist (a 404). The region the regional column refers to defaults to the
 * language's first, as the page always did.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.dictionary.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminDictionaryListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      const language = await requireLanguage(query.language);
      if (query.level) await assertLevelInLanguage(query.level, language.id);
      if (query.group) await assertGroupInLanguage(query.group, language.id);

      const provider = getLexicalLanguageProvider(language.code);
      if (query.region && !provider.regionCodes.includes(query.region)) {
        throw new AppError(
          "CURRICULUM_VALIDATION_FAILED",
          "That region isn't one this language's dictionary covers.",
        );
      }
      const regionCode = query.region ?? provider.regionCodes[0] ?? null;

      const [page, counts] = await Promise.all([
        getMappingQueue({
          languageId: language.id,
          levelId: query.level,
          vocabularyGroupId: query.group,
          matchStatus: query.status,
          partOfSpeech: query.pos,
          regionCode: regionCode ?? undefined,
          regionalStatus: query.regional,
          limit: query.limit,
          offset: query.offset,
        }),
        getMappingStatusCounts(language.id),
      ]);

      return parseResponse(
        adminDictionaryPageSchema,
        buildAdminDictionaryPage({
          page,
          counts,
          regionCode,
          regionCodes: provider.regionCodes,
        }),
      );
    },
  });
}
