import {
  adminDeckListQuerySchema,
  adminDeckListSchema,
  buildAdminDeckList,
  canManageCurriculum,
} from "@/domains/admin";
import { listPolyglotDecks } from "@/domains/decks/server";

import { handleAdminGet } from "../_lib/admin-route";
import { assertLanguageExists } from "../_lib/language";
import { parseResponse } from "../_lib/response-contract";

/**
 * `GET /api/v1/admin/decks` (spec 26 Unit 10) — the official Polyglot decks of
 * one language, with what each holds.
 *
 * **Admin and writer** (`canManageCurriculum`) may read: since the owner's
 * decision of 2026-10-14 a writer can see the official decks, which they could
 * not before. Creating, editing and deleting a deck stay an Admin's
 * (`canPublishCurriculum`, re-checked by every Server Action behind the editor).
 * The role is read from the database on every call.
 *
 * The read model is the existing `listPolyglotDecks`, which lists decks of kind
 * `polyglot` and nothing else. A learner's personal deck is private content and
 * has no administrative surface: this endpoint has no way to ask for one (there
 * is no `kind` or `owner` parameter, and the query is strict), and the response
 * carries no owner. The list is one bounded response and says so (`truncated`)
 * if it ever exceeds the bound. Creating, editing and deleting a deck stay the
 * deck page's own commands — this list only finds decks.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAdminGet(request, {
    route: "admin.decks.list",
    authorize: canManageCurriculum,
    load: async (_user, req) => {
      const query = adminDeckListQuerySchema.parse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      await assertLanguageExists(query.language);

      const decks = await listPolyglotDecks(query.language);
      return parseResponse(adminDeckListSchema, buildAdminDeckList(decks));
    },
  });
}
