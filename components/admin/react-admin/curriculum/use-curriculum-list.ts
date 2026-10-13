import { useCallback, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useGetList,
  useRecordSelection,
  type ListControllerResult,
} from "react-admin";

import {
  CURRICULUM_LIST_PAGE_SIZE,
  CURRICULUM_LIST_SORT,
  type AdminCurriculumRow,
} from "@/domains/admin";

import {
  applyCurriculumFilterChange,
  parseCurriculumListParams,
  sameListState,
  serializeCurriculumListParams,
  type CurriculumListLookups,
  type CurriculumListState,
} from "./curriculum-list-params";

const RESOURCE = "curriculum";

/** Operations the list context requires but this list deliberately does not offer. */
const unsupported = () => undefined;

type CursorMeta = {
  nextCursor: string | null;
  previousCursor: string | null;
};

/**
 * The Admin curriculum list's controller (spec 26 Unit 2).
 *
 * It exists because React Admin's own `ListBase`/`useListController` cannot
 * carry this list's state — see `list-base-spike.test.tsx` for the tested
 * evidence. In short: `ListBase` keeps `page`/`filter`/`sort` in React Admin's
 * router (here a contained `MemoryRouter`), never in the page's real URL; and
 * a page *number* cannot stand in for a deep-linkable keyset cursor.
 *
 * So this hook is the thin, custom part, and everything else stays React
 * Admin's: it fetches with `useGetList`, keeps selection in
 * `useRecordSelection`, and hands back a standard `ListContext` value so
 * `DataTable`, `FilterForm`, and the bulk-selection UI work unmodified.
 *
 * - **The Next URL is the only state.** `language, level, type, status,
 *   group, search, needs, cursor` are read from it (`useSearchParams`) and
 *   written back to it (`router.push`/`replace`), so refresh, deep links, the
 *   browser's Back button, and the item editor's `?from=` all keep working.
 * - **Cursors are the server's.** "Next"/"Previous" navigate by handing back
 *   the `nextCursor`/`previousCursor` the API returned; nothing is computed or
 *   remembered client-side, so a pasted link can go backwards too. Arbitrary
 *   page numbers and every sort are unsupported by design.
 * - **Selection is scoped to what is on screen.** It is cleared whenever the
 *   URL (so: the filters, language, or page) changes, and ids not in the
 *   current rows are never reported as selected.
 */
export function useCurriculumList(lookups: CurriculumListLookups) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const state = useMemo<CurriculumListState>(
    () => parseCurriculumListParams(new URLSearchParams(queryString), lookups),
    [queryString, lookups],
  );

  const list = useGetList<AdminCurriculumRow>(
    RESOURCE,
    {
      pagination: { page: 1, perPage: CURRICULUM_LIST_PAGE_SIZE },
      sort: { ...CURRICULUM_LIST_SORT },
      filter: { ...state.filters, cursor: state.cursor },
    },
    // Keep the previous page on screen while the next loads, instead of
    // flashing a skeleton between every page.
    { placeholderData: keepPreviousData },
  );

  const [selectedIds, selection] = useRecordSelection<AdminCurriculumRow>({
    resource: RESOURCE,
    disableSyncWithStore: true,
  });

  // Clear selection the moment the list's scope changes — adjusted during
  // render (React's documented pattern for state derived from a changed
  // input), not in an effect, so a stale selection never paints against the
  // new rows first.
  const [selectionScope, setSelectionScope] = useState(queryString);
  if (selectionScope !== queryString) {
    setSelectionScope(queryString);
    selection.clearSelection();
  }

  const rowIds = useMemo(
    () => new Set((list.data ?? []).map((row) => row.id)),
    [list.data],
  );
  const visibleSelectedIds = useMemo(
    () => selectedIds.filter((id) => rowIds.has(id)),
    [selectedIds, rowIds],
  );

  const goTo = useCallback(
    (
      next: CurriculumListState,
      how: "push" | "replace" = "push",
      scroll = true,
    ) => {
      // Never navigate to where we already are: it would only stack a
      // duplicate history entry (and, via the filter form's echo, could loop).
      if (sameListState(next, state)) return;
      const url = `${pathname}?${serializeCurriculumListParams(next.filters, next.cursor)}`;
      if (how === "replace") router.replace(url, { scroll });
      else router.push(url, { scroll });
    },
    [pathname, router, state],
  );

  const setFilters = useCallback(
    (requested: Record<string, unknown>) => {
      const filters = applyCurriculumFilterChange(state.filters, requested);
      // A refinement of the search text alone replaces the history entry
      // (Back should leave the list, not step through every keystroke) and
      // keeps the scroll position; any other filter change is a new view.
      const onlySearchChanged =
        serializeCurriculumListParams({
          ...filters,
          search: undefined,
        }).toString() ===
        serializeCurriculumListParams({
          ...state.filters,
          search: undefined,
        }).toString();
      goTo(
        { filters, cursor: undefined },
        onlySearchChanged ? "replace" : "push",
        !onlySearchChanged,
      );
    },
    [goTo, state.filters],
  );

  const meta = list.meta as CursorMeta | undefined;
  const hasNextPage = Boolean(list.pageInfo?.hasNextPage);
  const hasPreviousPage = Boolean(list.pageInfo?.hasPreviousPage);
  // While the next page loads the previous one is still shown, with *its*
  // cursors; acting on them would skip or repeat a page.
  const navigationLocked = list.isPlaceholderData;

  const goToNextPage = useCallback(() => {
    if (navigationLocked || !meta?.nextCursor) return;
    goTo({ filters: state.filters, cursor: meta.nextCursor });
  }, [goTo, meta, navigationLocked, state.filters]);

  const goToPreviousPage = useCallback(() => {
    if (navigationLocked || !hasPreviousPage) return;
    // A `null` previous cursor with a previous page means: the first page.
    goTo({ filters: state.filters, cursor: meta?.previousCursor ?? undefined });
  }, [goTo, hasPreviousPage, meta, navigationLocked, state.filters]);

  // React Admin's `ListControllerResult` is a union discriminated by loading
  // state, which a hand-built context cannot express field by field; the
  // shape below is exactly what `useListController` itself returns, minus the
  // router-coupled parts this list replaces.
  const listContext = {
    sort: { ...CURRICULUM_LIST_SORT },
    data: list.data,
    meta: list.meta,
    // No total, on purpose — see `adminCurriculumPageSchema`.
    total: undefined,
    error: list.error,
    isPending: list.isPending,
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    isPaused: list.isPaused,
    isPlaceholderData: list.isPlaceholderData,
    refetch: list.refetch,
    resource: RESOURCE,
    defaultTitle: "Curriculum",
    exporter: false,
    filterValues: state.filters,
    displayedFilters: {},
    setFilters,
    hideFilter: unsupported,
    showFilter: unsupported,
    // One fixed ordering, and no page numbers: these exist on the context
    // because React Admin's components expect them, and do nothing.
    page: 1,
    perPage: CURRICULUM_LIST_PAGE_SIZE,
    setPage: unsupported,
    setPerPage: unsupported,
    setSort: unsupported,
    hasNextPage,
    hasPreviousPage,
    selectedIds: visibleSelectedIds,
    onSelect: selection.select,
    onToggleItem: selection.toggle,
    onUnselectItems: () => selection.clearSelection(),
    onSelectAll: unsupported,
  } as unknown as ListControllerResult<AdminCurriculumRow>;

  return {
    listContext,
    state,
    rows: list.data,
    error: list.error,
    isPending: list.isPending,
    isRefetchError: list.isRefetchError,
    refetch: list.refetch,
    clearSelection: () => selection.clearSelection(),
    selectedRows: (list.data ?? []).filter((row) =>
      visibleSelectedIds.includes(row.id),
    ),
    pagination: {
      hasNextPage,
      hasPreviousPage,
      locked: navigationLocked,
      goToNextPage,
      goToPreviousPage,
    },
  };
}
