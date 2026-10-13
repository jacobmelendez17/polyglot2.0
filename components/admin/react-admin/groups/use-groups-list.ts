import { useMemo } from "react";

import {
  GROUP_LIST_MAX,
  GROUP_LIST_SORT,
  type AdminGroupRow,
} from "@/domains/admin";

import { useCursorList, type CursorListCodec } from "../use-cursor-list";
import {
  applyGroupFilterChange,
  parseGroupListParams,
  serializeGroupListParams,
  type GroupListFilters,
  type GroupListLookups,
} from "./group-list-params";

/**
 * The groups list's controller (spec 26 Unit 5): the shared list controller
 * (`useCursorList`) with `?language=` and `?level=` as its URL state.
 *
 * A level has a handful of groups, so this list is one bounded response — no
 * cursor is ever sent or returned. It still uses the shared controller for what
 * it does well regardless: the Next URL as the only state, the standard
 * `ListContext`, and one place that handles errors and refetching.
 *
 * A language with no levels has no groups to ask for, and the endpoint would
 * refuse a request that names no level; so nothing is fetched then, and the
 * screen says what to do instead.
 */
export function useGroupsList(lookups: GroupListLookups) {
  const codec = useMemo<CursorListCodec<GroupListFilters>>(
    () => ({
      parse: (params) => parseGroupListParams(params, lookups),
      serialize: serializeGroupListParams,
      applyChange: applyGroupFilterChange,
    }),
    [lookups],
  );

  return useCursorList<GroupListFilters, AdminGroupRow>({
    resource: "groups",
    title: "Groups",
    sort: GROUP_LIST_SORT,
    pageSize: GROUP_LIST_MAX,
    codec,
    canFetch: (filters) => filters.level !== "",
  });
}
