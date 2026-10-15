import {
  adminImportListQuerySchema,
  adminImportPageSchema,
  buildAdminImportPage,
  canManageCurriculum,
} from "@/domains/admin";
import {
  listActiveCurriculumImports,
  listArchivedCurriculumImportsForHistory,
} from "@/domains/admin/server";

import { handleAdminGet } from "../_lib/admin-route";
import { assertLanguageExists } from "../_lib/language";
import { parseResponse } from "../_lib/response-contract";

/**
 * `GET /api/v1/admin/imports` (spec 26 Unit 8) — one cursor-paginated page of a
 * language's curriculum-import history: the normal history, or the archived one
 * with `?archived=true`. Newest first.
 *
 * Admin **and writer** (`canManageCurriculum`), as the history pages always
 * were: a writer can see what has been imported. Starting, archiving, restoring
 * and deleting are separate commands with the stricter guard
 * (`canPublishCurriculum`).
 *
 * The read model is the existing `listActiveCurriculumImports` /
 * `listArchivedCurriculumImportsForHistory`; this only bounds and reduces it. A
 * row carries no storage location, checksum, uploader or error text (see
 * `adminImportRowSchema`). The query string is strict and the language must
 * exist.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.imports.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminImportListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );

      await assertLanguageExists(query.language);

      const list =
        query.archived === "true"
          ? listArchivedCurriculumImportsForHistory
          : listActiveCurriculumImports;
      const page = await list({
        languageId: query.language,
        cursor: query.cursor,
        limit: query.limit,
      });

      return parseResponse(adminImportPageSchema, buildAdminImportPage(page));
    },
  });
}
