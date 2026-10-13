import { CURRICULUM_LIST_SORT } from "@/domains/admin";

import {
  buildCursorListQuery,
  type CursorListRules,
} from "../cursor-list-query";

/** The filter keys `GET /api/v1/admin/curriculum` understands, in the order it is asked in. */
const CURRICULUM_RULES: CursorListRules = {
  filters: [
    "language",
    "level",
    "type",
    "status",
    "group",
    "search",
    "needs",
    "cursor",
  ],
  sort: CURRICULUM_LIST_SORT,
};

/** `getList("curriculum")`'s parameters as the endpoint's query string; see `buildCursorListQuery` for what is refused. */
export function buildCurriculumListQuery(
  params: Parameters<typeof buildCursorListQuery>[0],
): string {
  return buildCursorListQuery(params, CURRICULUM_RULES);
}
