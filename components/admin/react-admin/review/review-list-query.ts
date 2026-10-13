import { REVIEW_LIST_SORT } from "@/domains/admin";

import {
  buildCursorListQuery,
  type CursorListRules,
} from "../cursor-list-query";

/** `GET /api/v1/admin/review` takes a language and a cursor, nothing else. */
const REVIEW_RULES: CursorListRules = {
  filters: ["language", "cursor"],
  sort: REVIEW_LIST_SORT,
};

/** `getList("review")`'s parameters as the endpoint's query string; see `buildCursorListQuery` for what is refused. */
export function buildReviewListQuery(
  params: Parameters<typeof buildCursorListQuery>[0],
): string {
  return buildCursorListQuery(params, REVIEW_RULES);
}
