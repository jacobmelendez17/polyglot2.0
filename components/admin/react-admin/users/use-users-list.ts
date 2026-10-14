import { useMemo } from "react";

import {
  USER_LIST_PAGE_SIZE,
  USER_LIST_SORT,
  type AdminUserRow,
} from "@/domains/admin";

import { useCursorList, type CursorListCodec } from "../use-cursor-list";
import {
  applyUserFilterChange,
  parseUserListParams,
  serializeUserListParams,
  type UserListFilters,
} from "./user-list-params";

const codec: CursorListCodec<UserListFilters> = {
  parse: parseUserListParams,
  serialize: serializeUserListParams,
  applyChange: applyUserFilterChange,
};

/**
 * The account list's controller (spec 26 Unit 6): the shared cursor list
 * (`useCursorList`) with `?search=` and `?cursor=` as its URL state.
 *
 * Typing more of a search *refines* the view — it replaces the history entry
 * instead of stacking one per keystroke — and it is the only filter there is.
 */
export function useUsersList() {
  const stableCodec = useMemo(() => codec, []);
  return useCursorList<UserListFilters, AdminUserRow>({
    resource: "users",
    title: "Users",
    sort: USER_LIST_SORT,
    pageSize: USER_LIST_PAGE_SIZE,
    codec: stableCodec,
    isRefinement: () => true,
  });
}
