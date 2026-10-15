import { IMPORT_LIST_SORT } from "@/domains/admin";

import {
  buildCursorListQuery,
  type CursorListRules,
} from "../cursor-list-query";

/** `GET /api/v1/admin/imports` takes a language, which history (`archived`), and a cursor — nothing else. */
const IMPORT_RULES: CursorListRules = {
  filters: ["language", "archived", "cursor"],
  sort: IMPORT_LIST_SORT,
};

/** `getList("imports")`'s parameters as the endpoint's query string; see `buildCursorListQuery` for what is refused. */
export function buildImportsListQuery(
  params: Parameters<typeof buildCursorListQuery>[0],
): string {
  return buildCursorListQuery(params, IMPORT_RULES);
}
