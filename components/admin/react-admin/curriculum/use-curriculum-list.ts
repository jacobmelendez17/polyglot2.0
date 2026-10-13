import { useMemo } from "react";

import {
  CURRICULUM_LIST_PAGE_SIZE,
  CURRICULUM_LIST_SORT,
  type AdminCurriculumRow,
} from "@/domains/admin";

import { useCursorList, type CursorListCodec } from "../use-cursor-list";
import {
  applyCurriculumFilterChange,
  parseCurriculumListParams,
  serializeCurriculumListParams,
  type CurriculumListFilters,
  type CurriculumListLookups,
} from "./curriculum-list-params";

/** Typing more of a search refines the current view; changing any other filter opens a new one. */
function isSearchRefinement(
  previous: CurriculumListFilters,
  next: CurriculumListFilters,
): boolean {
  return (
    serializeCurriculumListParams({ ...next, search: undefined }).toString() ===
    serializeCurriculumListParams({
      ...previous,
      search: undefined,
    }).toString()
  );
}

/**
 * The Admin curriculum list's controller (spec 26 Unit 2): the shared cursor
 * list (`useCursorList` — see it for why `ListBase` is not used) with this
 * list's own URL parameters.
 *
 * `lookups` (languages, levels, groups) come from the server page. They
 * validate what the URL asks for: an unknown language falls back to the first,
 * and a level or group from another language is dropped.
 */
export function useCurriculumList(lookups: CurriculumListLookups) {
  const codec = useMemo<CursorListCodec<CurriculumListFilters>>(
    () => ({
      parse: (params) => parseCurriculumListParams(params, lookups),
      serialize: serializeCurriculumListParams,
      applyChange: applyCurriculumFilterChange,
    }),
    [lookups],
  );

  return useCursorList<CurriculumListFilters, AdminCurriculumRow>({
    resource: "curriculum",
    title: "Curriculum",
    sort: CURRICULUM_LIST_SORT,
    pageSize: CURRICULUM_LIST_PAGE_SIZE,
    codec,
    isRefinement: isSearchRefinement,
  });
}
