import { useMemo } from "react";

import {
  LEVEL_LIST_MAX,
  LEVEL_LIST_SORT,
  type AdminLevelRow,
} from "@/domains/admin";

import {
  applyLanguageFilterChange,
  parseLanguageListParams,
  serializeLanguageListParams,
  type LanguageListFilters,
  type LanguageListLookups,
} from "../language-list-params";
import { useCursorList, type CursorListCodec } from "../use-cursor-list";

/**
 * The levels list's controller (spec 26 Unit 4): the shared list controller
 * (`useCursorList`) with `?language=` as its only URL state.
 *
 * A language has a handful of levels, so this list is one bounded response —
 * no cursor is ever sent or returned and there is nothing to page through. It
 * still uses the shared controller for what it does well regardless: the Next
 * URL as the only state, the standard `ListContext`, and one place that
 * handles errors and refetching.
 */
export function useLevelsList(lookups: LanguageListLookups) {
  const codec = useMemo<CursorListCodec<LanguageListFilters>>(
    () => ({
      parse: (params) => parseLanguageListParams(params, lookups),
      serialize: serializeLanguageListParams,
      applyChange: applyLanguageFilterChange,
    }),
    [lookups],
  );

  return useCursorList<LanguageListFilters, AdminLevelRow>({
    resource: "levels",
    title: "Levels",
    sort: LEVEL_LIST_SORT,
    pageSize: LEVEL_LIST_MAX,
    codec,
  });
}
