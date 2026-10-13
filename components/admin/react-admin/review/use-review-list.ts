import { useMemo } from "react";

import {
  REVIEW_LIST_PAGE_SIZE,
  REVIEW_LIST_SORT,
  type AdminReviewRow,
} from "@/domains/admin";

import { useCursorList, type CursorListCodec } from "../use-cursor-list";
import {
  applyReviewFilterChange,
  parseReviewListParams,
  serializeReviewListParams,
  type ReviewListFilters,
  type ReviewListLookups,
} from "./review-list-params";

/**
 * The review queue's controller (spec 26 Unit 3): the shared cursor list
 * (`useCursorList`) with the queue's own URL — `?language=&cursor=`.
 */
export function useReviewList(lookups: ReviewListLookups) {
  const codec = useMemo<CursorListCodec<ReviewListFilters>>(
    () => ({
      parse: (params) => parseReviewListParams(params, lookups),
      serialize: serializeReviewListParams,
      applyChange: applyReviewFilterChange,
    }),
    [lookups],
  );

  return useCursorList<ReviewListFilters, AdminReviewRow>({
    resource: "review",
    title: "Review",
    sort: REVIEW_LIST_SORT,
    pageSize: REVIEW_LIST_PAGE_SIZE,
    codec,
  });
}
