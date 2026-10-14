import type { UserRole } from "./user-types";

/**
 * What an Admin may see of one account (spec 26 Unit 6) — a deliberately small,
 * separate shape rather than `PolyglotUser`, so a column added to the user row
 * tomorrow cannot reach the Admin console by accident. There is no Clerk id,
 * no email, no timezone, and nothing about progress: only enough to recognise a
 * person and to change their role.
 */
export type AdminUserRecord = {
  id: string;
  displayName: string | null;
  username: string | null;
  role: UserRole;
  /** When the account was created, as microsecond-precision ISO text (UTC). */
  createdAt: string;
  /**
   * The version token for a role change: the row's `updated_at` as
   * microsecond-precision ISO text (UTC). Send it back as `expectedUpdatedAt`;
   * a change is refused if the row has moved on since. Text rather than a
   * `Date` because a JavaScript `Date` keeps only milliseconds, and a token
   * that rounds can never match the row it came from.
   */
  updatedAt: string;
};

export type AdminUsersPage = {
  items: AdminUserRecord[];
  /** Opaque cursor for the next page, or `null` on the last. */
  nextCursor: string | null;
  hasPreviousPage: boolean;
  /** `null` both when there is no previous page and when it is the first (which needs no cursor). */
  previousCursor: string | null;
};

export type ListAdminUsersInput = {
  /** Matches a username or display name (case-insensitive, anywhere in it), or an exact account id. */
  search?: string;
  limit: number;
  cursor?: string;
};

/** The most accounts one request may ask for. */
export const ADMIN_USER_LIST_MAX_PAGE_SIZE = 50;

/** What a role change must know about the account it is for, read under lock. */
export type RoleChangeTarget = {
  id: string;
  role: UserRole;
  isSandbox: boolean;
  /** Whether the account is linked to a Clerk sign-in. Sandbox personas are not. */
  hasClerkIdentity: boolean;
  /** Whether the row's `updated_at` still equals the token the caller read. */
  versionMatches: boolean;
};
