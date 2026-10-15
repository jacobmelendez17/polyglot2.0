import { useMemo } from "react";

import {
  DECK_LIST_MAX,
  DECK_LIST_SORT,
  type AdminDeckRow,
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
 * The official-decks list's controller (spec 26 Unit 10): the shared list
 * controller (`useCursorList`) with `?language=` as its only URL state — the
 * same as the levels list, and for the same reason: a language has a handful of
 * official decks, so this is one bounded response with nothing to page through,
 * and the shared controller still provides what it does well regardless (the
 * Next URL as the only state, the standard `ListContext`, one place that handles
 * errors and refetching).
 */
export function useDecksList(lookups: LanguageListLookups) {
  const codec = useMemo<CursorListCodec<LanguageListFilters>>(
    () => ({
      parse: (params) => parseLanguageListParams(params, lookups),
      serialize: serializeLanguageListParams,
      applyChange: applyLanguageFilterChange,
    }),
    [lookups],
  );

  return useCursorList<LanguageListFilters, AdminDeckRow>({
    resource: "decks",
    title: "Decks",
    sort: DECK_LIST_SORT,
    pageSize: DECK_LIST_MAX,
    codec,
  });
}
