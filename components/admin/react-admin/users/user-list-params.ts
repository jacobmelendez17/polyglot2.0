/**
 * The account list's URL state (spec 26 Unit 6): a search and a cursor, nothing
 * else. Accounts are not scoped to a language or a level, and there is no role
 * filter and no way to ask for sandbox personas — the server offers none.
 *
 * The URL is the only state, so a filtered view is bookmarkable, survives a
 * refresh, and "Previous" works from a pasted link.
 */

import { USER_SEARCH_MAX } from "@/domains/admin";

export type UserListFilters = {
  search?: string;
};

type ParamsLike = { get(name: string): string | null };

/** The page this list lives on. */
export const USERS_PATH = "/admin/users";

function cleanSearch(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Cut to what the server accepts: a hand-edited address must not become a 422.
  const trimmed = value.trim().slice(0, USER_SEARCH_MAX).trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseUserListParams(params: ParamsLike): {
  filters: UserListFilters;
  cursor: string | undefined;
} {
  return {
    filters: { search: cleanSearch(params.get("search")) },
    cursor: params.get("cursor") || undefined,
  };
}

/** Empty values omitted, order fixed — so equal states are equal strings. */
export function serializeUserListParams(
  filters: UserListFilters,
  cursor?: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (cursor) params.set("cursor", cursor);
  return params;
}

/**
 * Applies an edit from the search box. A cursor is only meaningful under the
 * exact search that produced it, so any change starts at the first page (the
 * list controller drops the cursor on every filter change). Unknown keys in
 * `requested` are ignored, never forwarded.
 */
export function applyUserFilterChange(
  _previous: UserListFilters,
  requested: Record<string, unknown>,
): UserListFilters {
  return { search: cleanSearch(requested.search) };
}
