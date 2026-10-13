import { CURRICULUM_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";

/** The filter keys `GET /api/v1/admin/curriculum` understands, in the order it is asked in. */
const SUPPORTED_FILTERS = [
  "language",
  "level",
  "type",
  "status",
  "group",
  "search",
  "needs",
  "cursor",
] as const;

type ListParams = {
  filter?: Record<string, unknown>;
  sort?: { field: string; order: string };
  pagination?: { page: number; perPage: number };
};

function unsupported(detail: string): never {
  // 405, not 401/403: this is "that list operation isn't offered", which must
  // not look like an authentication failure to `authProvider.checkError`.
  throw new AdminApiError("UNSUPPORTED_OPERATION", 405, detail);
}

/**
 * Translates React Admin's `getList` parameters into the endpoint's query
 * string — and refuses anything the endpoint cannot do correctly, rather than
 * passing it along to be ignored (spec 26 §3 "Cursor pagination contract"):
 *
 * - **Sort:** exactly one ordering exists (the keyset's own); any other
 *   `sort` is refused, since a cursor only means something under the order
 *   that produced it.
 * - **Page:** a page *number* cannot be turned into a cursor without walking
 *   every earlier page, so arbitrary page jumps are refused. The list always
 *   asks for "page 1 after this cursor".
 * - **Filters:** only the endpoint's own; an unknown key is refused.
 *
 * Empty values are dropped, so an unset filter is simply absent.
 */
export function buildCurriculumListQuery({
  filter = {},
  sort,
  pagination,
}: ListParams): string {
  if (
    sort &&
    (sort.field !== CURRICULUM_LIST_SORT.field ||
      sort.order !== CURRICULUM_LIST_SORT.order)
  ) {
    unsupported(`sort by ${sort.field} ${sort.order}`);
  }
  if (pagination && pagination.page !== 1) {
    unsupported(`jump to page ${pagination.page}`);
  }

  const params = new URLSearchParams();
  for (const key of Object.keys(filter)) {
    if (!(SUPPORTED_FILTERS as readonly string[]).includes(key)) {
      unsupported(`filter by ${key}`);
    }
  }
  for (const key of SUPPORTED_FILTERS) {
    const value = filter[key];
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  if (pagination) params.set("limit", String(pagination.perPage));
  return params.toString();
}
