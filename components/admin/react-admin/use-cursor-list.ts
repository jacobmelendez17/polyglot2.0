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
 * How one list's state maps to and from the page's real URL. Each list owns
 * its parameters (the curriculum list has seven filters, the review queue
 * only a language); the hook owns everything else.
 */
export type CursorListCodec<F> = {
  parse(params: URLSearchParams): { filters: F; cursor: string | undefined };
  /** Empty values omitted, order fixed — so equal states are equal strings. */
  serialize(filters: F, cursor?: string): URLSearchParams;
  /** Applies an edit from the filter form to the previous filters (dependent resets live here). */
  applyChange(previous: F, requested: Record<string, unknown>): F;
};

export type CursorListConfig<F> = {
  resource: string;
  title: string;
  sort: { readonly field: string; readonly order: "ASC" | "DESC" };
  pageSize: number;
  codec: CursorListCodec<F>;
  /**
   * Whether moving from `previous` to `next` merely *refines* the view (typing
   * more of a search): that replaces the history entry and keeps the scroll
   * position, where any other change opens a new view.
   */
  isRefinement?: (previous: F, next: F) => boolean;
};

type CursorMeta = {
  nextCursor: string | null;
  previousCursor: string | null;
};

/** Operations the list context requires but a cursor list deliberately does not offer. */
const unsupported = () => undefined;

/**
 * The controller behind every cursor-paginated Admin list (spec 26 Units 2-3).
 *
 * It exists because React Admin's own `ListBase`/`useListController` cannot
 * carry this state — see `curriculum/list-base-spike.test.tsx` for the tested
 * evidence. In short: `ListBase` keeps `page`/`filter`/`sort` in React Admin's
 * router (here a contained `MemoryRouter`), never in the page's real URL; and
 * a page *number* cannot stand in for a deep-linkable keyset cursor.
 *
 * So this hook is the thin, custom part, and everything else stays React
 * Admin's: it fetches with `useGetList`, keeps selection in
 * `useRecordSelection`, and hands back a standard `ListContext` value so
 * `DataTable`, `FilterForm`, and the selection UI work unmodified.
 *
 * - **The Next URL is the only state.** Filters and the cursor are read from it
 *   (`useSearchParams`) and written back to it (`router.push`/`replace`), so
 *   refresh, deep links, the browser's Back button, and `?from=` all work.
 * - **Cursors are the server's.** "Next"/"Previous" navigate by handing back
 *   the `nextCursor`/`previousCursor` the API returned; nothing is computed or
 *   remembered client-side, so a pasted link can go backwards too. Arbitrary
 *   page numbers and every sort are unsupported by design.
 * - **Selection is scoped to what is on screen.** It is cleared whenever the
 *   URL (so: the filters or the page) changes, and ids not in the current
 *   rows are never reported as selected.
 */
export function useCursorList<F extends object, Row extends RaRecord>({
  resource,
  title,
  sort,
  pageSize,
  codec,
  isRefinement,
}: CursorListConfig<F>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const state = useMemo(
    () => codec.parse(new URLSearchParams(queryString)),
    [queryString, codec],
  );

  const list = useGetList<Row>(
    resource,
    {
      pagination: { page: 1, perPage: pageSize },
      sort: { ...sort },
      filter: { ...state.filters, cursor: state.cursor },
    },
    // Keep the previous page on screen while the next loads, instead of
    // flashing a skeleton between every page.
    { placeholderData: keepPreviousData },
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
    (
      next: { filters: F; cursor: string | undefined },
      how: "push" | "replace" = "push",
      scroll = true,
    ) => {
      const query = codec.serialize(next.filters, next.cursor).toString();
      // Never navigate to where we already are: it would only stack a
      // duplicate history entry (and, via the filter form's echo, could loop).
      if (query === codec.serialize(state.filters, state.cursor).toString()) {
        return;
      }
      const url = `${pathname}?${query}`;
      if (how === "replace") router.replace(url, { scroll });
      else router.push(url, { scroll });
    },
    [codec, pathname, router, state],
  );

  const setFilters = useCallback(
    (requested: Record<string, unknown>) => {
      const filters = codec.applyChange(state.filters, requested);
      const refining = isRefinement?.(state.filters, filters) ?? false;
      goTo(
        { filters, cursor: undefined },
        refining ? "replace" : "push",
        !refining,
      );
    },
    [codec, goTo, isRefinement, state.filters],
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
    sort: { ...sort },
    data: list.data,
    meta: list.meta,
    // No total, on purpose — an exact count over an unbounded list is a full scan.
    total: undefined,
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
    // One fixed ordering, and no page numbers: these exist on the context
    // because React Admin's components expect them, and do nothing.
    page: 1,
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
