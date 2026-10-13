import { GROUP_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";

type ListParams = {
  filter?: Record<string, unknown>;
  sort?: { field: string; order: string };
  pagination?: { page: number; perPage: number };
};

function unsupported(detail: string): never {
  // 405, not 401/403: "that list operation isn't offered" must not look like
  // an authentication failure to `authProvider.checkError`.
  throw new AdminApiError("UNSUPPORTED_OPERATION", 405, detail);
}

/**
 * `getList("groups")`'s parameters as the endpoint's query string — and a
 * refusal of anything it cannot do correctly (spec 26 §3). The endpoint takes
 * a language **and a level** and nothing else: a group's position only means
 * something within its own level, so groups are never listed across levels, and
 * a level holds a handful of groups, so there is one bounded response, no
 * cursor, and one ordering — by position. A sort is refused rather than
 * ignored, because the position *is* the order learners meet.
 *
 * `perPage` is deliberately not sent: the server's own bound applies, and the
 * endpoint rejects a `limit` it does not implement.
 */
export function buildGroupsListQuery({
  filter = {},
  sort,
  pagination,
}: ListParams): string {
  if (
    sort &&
    (sort.field !== GROUP_LIST_SORT.field ||
      sort.order !== GROUP_LIST_SORT.order)
  ) {
    unsupported(`sort by ${sort.field} ${sort.order}`);
  }
  if (pagination && pagination.page !== 1) {
    unsupported(`jump to page ${pagination.page}`);
  }
  for (const key of Object.keys(filter)) {
    if (key !== "language" && key !== "level" && key !== "cursor") {
      unsupported(`filter by ${key}`);
    }
  }
  // The list has no cursor. `useCursorList` always names one (as `undefined`),
  // so only a *real* one is refused.
  if (typeof filter.cursor === "string" && filter.cursor !== "") {
    unsupported("a cursor");
  }

  const { language, level } = filter;
  if (typeof language !== "string" || language === "") {
    unsupported("listing groups without a language");
  }
  if (typeof level !== "string" || level === "") {
    unsupported("listing groups without a level");
  }
  return new URLSearchParams({ language, level }).toString();
}
