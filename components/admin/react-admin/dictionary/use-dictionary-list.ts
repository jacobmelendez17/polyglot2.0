import { useMemo } from "react";

import {
  DICTIONARY_LIST_PAGE_SIZE,
  DICTIONARY_LIST_SORT,
  type AdminDictionaryRow,
} from "@/domains/admin";

import { useOffsetList } from "../use-offset-list";
import {
  dictionaryListCodec,
  type DictionaryListFilters,
  type DictionaryListLookups,
} from "./dictionary-list-params";

/**
 * The dictionary mapping queue's controller (spec 26 Unit 9): the shared
 * offset-paginated list controller (`useOffsetList`) with the queue's own URL —
 * `?language=&level=&group=&status=&pos=&region=&regional=&offset=` — read from
 * the real address, so a filtered queue is bookmarkable and survives a refresh.
 */
export function useDictionaryList(lookups: DictionaryListLookups) {
  const codec = useMemo(() => dictionaryListCodec(lookups), [lookups]);

  return useOffsetList<DictionaryListFilters, AdminDictionaryRow>({
    resource: "dictionary",
    title: "Dictionary",
    sort: DICTIONARY_LIST_SORT,
    pageSize: DICTIONARY_LIST_PAGE_SIZE,
    codec,
  });
}
