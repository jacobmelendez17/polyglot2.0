import { USER_LIST_SORT } from "@/domains/admin";

import {
  buildCursorListQuery,
  type CursorListRules,
} from "../cursor-list-query";

/** The filter keys `GET /api/v1/admin/users` understands, in the order it is asked in. */
const USER_RULES: CursorListRules = {
  filters: ["search", "cursor"],
  sort: USER_LIST_SORT,
};

/**
 * `getList("users")`'s parameters as the endpoint's query string; see
 * `buildCursorListQuery` for what is refused. In particular there is no filter
 * by role and none for sandbox personas: asking for one is refused here, before
 * a request is made, as the endpoint would refuse it too.
 */
export function buildUsersListQuery(
  params: Parameters<typeof buildCursorListQuery>[0],
): string {
  return buildCursorListQuery(params, USER_RULES);
}
