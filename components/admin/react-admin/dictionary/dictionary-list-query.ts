import { DICTIONARY_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";

type ListParams = {
  filter?: Record<string, unknown>;
  sort?: { field: string; order: string };
  pagination?: { page: number; perPage: number };
};

/** The filters `GET /api/v1/admin/dictionary` takes, in the order they are written. */
const FILTERS = [
  "language",
  "level",
  "group",
  "status",
  "pos",
  "region",
  "regional",
] as const;

function unsupported(detail: string): never {
  // 405, not 401/403: "that list operation isn't offered" must not look like an
  // authentication failure to `authProvider.checkError`.
  throw new AdminApiError("UNSUPPORTED_OPERATION", 405, detail);
}

/**
 * `getList("dictionary")`'s parameters as the endpoint's query string — and a
 * refusal of anything it cannot do correctly (spec 26 §3):
 *
 * - **Sort:** exactly one ordering exists (level, group, word); any other is
 *   refused rather than passed along to be ignored.
 * - **Filters:** only the queue's own; an unknown key is refused.
 * - **Language:** required — the queue is read one language at a time.
 * - **Page:** this queue pages by offset and has a real total, so React Admin's
 *   `page` and `perPage` *are* meaningful here: they become `offset` and
 *   `limit`. (The keyset lists refuse any page but the first.)
 *
 * Empty values are dropped, so an unset filter is simply absent.
 */
export function buildDictionaryListQuery({
  filter = {},
  sort,
  pagination,
}: ListParams): string {
  if (
    sort &&
    (sort.field !== DICTIONARY_LIST_SORT.field ||
      sort.order !== DICTIONARY_LIST_SORT.order)
  ) {
    unsupported(`sort by ${sort.field} ${sort.order}`);
  }
  for (const key of Object.keys(filter)) {
    if (!(FILTERS as readonly string[]).includes(key)) {
      unsupported(`filter by ${key}`);
    }
  }
  if (typeof filter.language !== "string" || filter.language === "") {
    unsupported("listing the dictionary queue without a language");
  }

  const params = new URLSearchParams();
  for (const key of FILTERS) {
    const value = filter[key];
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  if (pagination) {
    if (!Number.isInteger(pagination.page) || pagination.page < 1) {
      unsupported(`page ${pagination.page}`);
    }
    params.set("limit", String(pagination.perPage));
    if (pagination.page > 1) {
      params.set("offset", String((pagination.page - 1) * pagination.perPage));
    }
  }
  return params.toString();
}
