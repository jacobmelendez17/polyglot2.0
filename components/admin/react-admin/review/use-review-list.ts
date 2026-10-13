import { useMemo } from "react";

import {
  REVIEW_LIST_PAGE_SIZE,
  REVIEW_LIST_SORT,
  type AdminReviewRow,
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
 * The review queue's controller (spec 26 Unit 3): the shared cursor list
 * (`useCursorList`) with the queue's own URL — `?language=&cursor=`.
 */
export function useReviewList(lookups: LanguageListLookups) {
  const codec = useMemo<CursorListCodec<LanguageListFilters>>(
    () => ({
      parse: (params) => parseLanguageListParams(params, lookups),
      serialize: serializeLanguageListParams,
      applyChange: applyLanguageFilterChange,
    }),
    [lookups],
  );

  return useCursorList<LanguageListFilters, AdminReviewRow>({
    resource: "review",
    title: "Review",
    sort: REVIEW_LIST_SORT,
    pageSize: REVIEW_LIST_PAGE_SIZE,
    codec,
  });
}
