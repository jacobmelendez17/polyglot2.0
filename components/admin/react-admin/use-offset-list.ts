import { useCallback, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useGetList,
  useRecordSelection,
  type ListControllerResult,
  type RaRecord,
} from "react-admin";

/**
 * How one offset-paginated list's state maps to and from the page's real URL.
 * Each list owns its parameters (the dictionary queue has seven filters); the
 * hook owns everything else.
 */
export type OffsetListCodec<F> = {
  /** `offset` is how many rows precede the page; always a whole number of pages. */
  parse(params: URLSearchParams): { filters: F; offset: number };
  /** Empty values omitted, order fixed — so equal states are equal strings. */
  serialize(filters: F, offset?: number): URLSearchParams;
  /** Applies an edit from the filter form to the previous filters (dependent resets live here). */
  applyChange(previous: F, requested: Record<string, unknown>): F;
};

export type OffsetListConfig<F> = {
  resource: string;
  title: string;
  sort: { readonly field: string; readonly order: "ASC" | "DESC" };
  pageSize: number;
  codec: OffsetListCodec<F>;
};

/** Operations the list context requires but this list deliberately does not offer. */
const unsupported = () => undefined;

/**
 * The controller behind an Admin list that pages by **offset** and knows its
 * **total** (spec 26 Unit 9: the dictionary mapping queue, whose repository
 * counts and has always shown "1–25 of 130"). It is `useCursorList`'s sibling
 * and exists for the same reason — React Admin's own `ListBase` keeps its
 * state in a contained router, never in the page's real URL — and everything
 * else stays React Admin's: `useGetList` fetches, `useRecordSelection` holds
 * the selection, and a standard `ListContext` goes to `DataTable` and the
 * filter form.
 *
 * - **The Next URL is the only state.** Filters and `offset` are read from it
 *   and written back to it, so refresh, deep links and Back all work.
 * - **Pages are whole.** `offset` is rounded down to a multiple of the page
 *   size, so any address names a real page, and "Next"/"Previous" move by
 *   exactly one page.
 * - **Any filter change starts again at the first page** — an offset only means
 *   something under the filters that produced it.
 * - **Selection is scoped to what is on screen.** It is cleared whenever the
 *   URL changes, and ids that are not in the current rows are never reported as
 *   selected.
 */
export function useOffsetList<F extends object, Row extends RaRecord>({
  resource,
  title,
  sort,
  pageSize,
  codec,
}: OffsetListConfig<F>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const state = useMemo(
    () => codec.parse(new URLSearchParams(queryString)),
    [queryString, codec],
  );
  const page = Math.floor(state.offset / pageSize) + 1;

  const list = useGetList<Row>(
    resource,
    {
      pagination: { page, perPage: pageSize },
      sort: { ...sort },
      filter: { ...state.filters },
    },
    {
      // Keep the previous page on screen while the next loads, instead of
      // flashing a skeleton between every page.
      placeholderData: keepPreviousData,
    },
  );

  const [selectedIds, selection] = useRecordSelection<Row>({
    resource,
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
    (next: { filters: F; offset: number }) => {
      const query = codec.serialize(next.filters, next.offset).toString();
      // Never navigate to where we already are: it would only stack a
      // duplicate history entry (and, via the filter form's echo, could loop).
      if (query === codec.serialize(state.filters, state.offset).toString()) {
        return;
      }
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: true });
    },
    [codec, pathname, router, state],
  );

  const setFilters = useCallback(
    (requested: Record<string, unknown>) => {
      goTo({
        filters: codec.applyChange(state.filters, requested),
        offset: 0,
      });
    },
    [codec, goTo, state.filters],
  );

  const total = list.total;
  const shown = list.data?.length ?? 0;
  const hasPreviousPage = state.offset > 0;
  const hasNextPage = total !== undefined && state.offset + shown < total;
  // While the next page loads the previous one is still shown, with *its*
  // total and rows; moving from it would skip or repeat a page.
  const navigationLocked = list.isPlaceholderData;

  const goToNextPage = useCallback(() => {
    if (navigationLocked || !hasNextPage) return;
    goTo({ filters: state.filters, offset: state.offset + pageSize });
  }, [goTo, hasNextPage, navigationLocked, pageSize, state]);

  const goToPreviousPage = useCallback(() => {
    if (navigationLocked || !hasPreviousPage) return;
    goTo({
      filters: state.filters,
      offset: Math.max(0, state.offset - pageSize),
    });
  }, [goTo, hasPreviousPage, navigationLocked, pageSize, state]);

  // React Admin's `ListControllerResult` is a union discriminated by loading
  // state, which a hand-built context cannot express field by field; the shape
  // below is exactly what `useListController` itself returns, minus the
  // router-coupled parts this list replaces.
  const listContext = {
    sort: { ...sort },
    data: list.data,
    meta: list.meta,
    total,
    error: list.error,
    isPending: list.isPending,
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    isPaused: list.isPaused,
    isPlaceholderData: list.isPlaceholderData,
    refetch: list.refetch,
    resource,
    defaultTitle: title,
    exporter: false,
    filterValues: state.filters,
    displayedFilters: {},
    setFilters,
    hideFilter: unsupported,
    showFilter: unsupported,
    // One fixed ordering, and no jumping to a page number: these exist on the
    // context because React Admin's components expect them, and do nothing.
    page,
    perPage: pageSize,
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
  } as unknown as ListControllerResult<Row>;

  return {
    listContext,
    state,
    rows: list.data,
    meta: list.meta as Record<string, unknown> | undefined,
    error: list.error,
    isPending: list.isPending,
    isRefetchError: list.isRefetchError,
    refetch: list.refetch,
    clearSelection: () => selection.clearSelection(),
    selectedRows: (list.data ?? []).filter((row) =>
      visibleSelectedIds.includes(row.id),
    ),
    pagination: {
      /** 1-based position of the first row shown; 0 when nothing is. */
      from: shown === 0 ? 0 : state.offset + 1,
      to: state.offset + shown,
      total,
      hasNextPage,
      hasPreviousPage,
      locked: navigationLocked,
      goToNextPage,
      goToPreviousPage,
    },
  };
}
