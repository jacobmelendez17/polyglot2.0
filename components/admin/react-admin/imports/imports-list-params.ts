import {
  applyLanguageFilterChange,
  parseLanguageListParams,
  serializeLanguageListParams,
  type LanguageListFilters,
  type LanguageListLookups,
} from "../language-list-params";
import type { CursorListCodec } from "../use-cursor-list";

/**
 * The import history's URL state (spec 26 Unit 8): `?language=&cursor=`, the
 * same as the review queue — plus which history it is, which is the *route's*
 * business (`/imports` or `/imports/archived`), never a URL parameter. It rides
 * in the filters so the list asks the endpoint for the right one, and so the two
 * histories are different queries in the cache.
 */
export type ImportListFilters = LanguageListFilters & {
  archived?: "true";
};

export function importListCodec(
  lookups: LanguageListLookups,
  archived: boolean,
): CursorListCodec<ImportListFilters> {
  const history = archived ? ({ archived: "true" } as const) : {};
  return {
    parse: (params) => {
      const { filters, cursor } = parseLanguageListParams(params, lookups);
      return { filters: { ...filters, ...history }, cursor };
    },
    // The history is the route: it is never written into the address.
    serialize: (filters, cursor) =>
      serializeLanguageListParams({ language: filters.language }, cursor),
    applyChange: (previous, requested) => ({
      ...applyLanguageFilterChange(previous, requested),
      ...history,
    }),
  };
}
