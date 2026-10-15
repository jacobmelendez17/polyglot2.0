import { useMemo } from "react";

import {
  IMPORT_LIST_PAGE_SIZE,
  IMPORT_LIST_SORT,
  type AdminImportRow,
} from "@/domains/admin";
import { isPipelineWorking } from "@/components/admin/curriculum/import-status";

import type { LanguageListLookups } from "../language-list-params";
import { useCursorList } from "../use-cursor-list";
import { importListCodec, type ImportListFilters } from "./imports-list-params";

/** How often the history reads itself again while an import is being worked on in the background. */
export const IMPORT_REFRESH_MS = 5000;

/**
 * Whether to read the history again by itself. Only while the pipeline has an
 * import to move along — a row waiting for a person, or finished, will not
 * change until someone acts — so a quiet history costs no requests at all.
 * (The import's own page polls on the same rule, `TERMINAL_STATUSES`.)
 */
export function refreshWhileWorking(
  rows: readonly AdminImportRow[] | undefined,
  intervalMs: number = IMPORT_REFRESH_MS,
): number | false {
  return rows?.some((row) => isPipelineWorking(row.status))
    ? intervalMs
    : false;
}

/**
 * The import history's controller (spec 26 Unit 8): the shared cursor list
 * (`useCursorList`) with the history's own URL — `?language=&cursor=` — for the
 * normal history or the archived one.
 */
export function useImportsList(
  lookups: LanguageListLookups,
  archived: boolean,
  refreshMs: number = IMPORT_REFRESH_MS,
) {
  const codec = useMemo(
    () => importListCodec(lookups, archived),
    [lookups, archived],
  );

  return useCursorList<ImportListFilters, AdminImportRow>({
    resource: "imports",
    title: archived ? "Archived imports" : "Imports",
    sort: IMPORT_LIST_SORT,
    pageSize: IMPORT_LIST_PAGE_SIZE,
    codec,
    refetchInterval: (rows) => refreshWhileWorking(rows, refreshMs),
  });
}
