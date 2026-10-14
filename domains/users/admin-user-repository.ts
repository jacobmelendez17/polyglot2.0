import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "@/db/client";
import { users } from "@/db/schema";
import { isLockTimeout } from "@/domains/idempotency/with-idempotency";
import { AppError } from "@/lib/errors/app-error";

import {
  ADMIN_USER_LIST_MAX_PAGE_SIZE,
  type AdminUserRecord,
  type AdminUsersPage,
  type ListAdminUsersInput,
  type RoleChangeTarget,
} from "./admin-user-types";
import type { UserRole } from "./user-types";

/**
 * The Admin console's view of accounts (spec 26 Unit 6): a sanitized,
 * paginated read model, and the few primitives a role change is built from.
 * Both take an injected `DbClient`, like every repository here, so a role
 * change can run inside the caller's transaction.
 *
 * Only **real** accounts exist as far as this file is concerned: a row with a
 * Clerk identity and `is_sandbox = false`. A sandbox persona is a user row too
 * (ADR-020) but has no sign-in, and is managed by the sandbox tools — it is
 * never listed, and never a target.
 */

/**
 * A timestamp as microsecond-precision ISO text in UTC. Postgres keeps
 * microseconds and JavaScript's `Date` only milliseconds, so anything that has
 * to match a row *exactly* — a version token, a keyset cursor — travels as this
 * text instead of being rounded through a `Date`.
 */
const isoMicros = (column: AnyColumn) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const SELECTION = {
  id: users.id,
  displayName: users.displayName,
  username: users.username,
  role: users.role,
  createdAt: isoMicros(users.createdAt).as("created_at_iso"),
  updatedAt: isoMicros(users.updatedAt).as("updated_at_iso"),
};

function toRecord(row: {
  id: string;
  displayName: string | null;
  username: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}): AdminUserRecord {
  // Field by field, never a spread: what leaves this file is exactly this list.
  return {
    id: row.id,
    displayName: row.displayName,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Real accounts only: signed up through Clerk, and not a sandbox persona. */
const REAL_ACCOUNT = [
  eq(users.isSandbox, false),
  isNotNull(users.clerkUserId),
] as const;

const listInputSchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(ADMIN_USER_LIST_MAX_PAGE_SIZE),
  cursor: z.string().trim().min(1).max(512).optional(),
});

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MICROS_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** `%` and `_` are wildcards to `ILIKE` and `\` escapes them: a person searching for `a_b` means those three characters. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

/** A name or username containing the term, or exactly this account (an id copied from the audit log). */
function searchCondition(term: string): SQL {
  const pattern = `%${escapeLike(term)}%`;
  return or(
    ilike(users.displayName, pattern),
    ilike(users.username, pattern),
    UUID_SHAPE.test(term) ? eq(users.id, term) : undefined,
  )!;
}

/** Opaque keyset cursor over `(created_at, id)`; the timestamp keeps its microseconds. */
type Cursor = { c: string; i: string };

function encodeCursor(row: { createdAt: string; id: string }): string {
  const cursor: Cursor = { c: row.createdAt, i: row.id };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function invalidCursor(): AppError {
  return new AppError(
    "CURRICULUM_VALIDATION_FAILED",
    "That page link is not valid. Go back to the first page.",
  );
}

function decodeCursor(value: string): Cursor {
  let candidate: unknown;
  try {
    candidate = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  const { c, i } = (candidate ?? {}) as Partial<Cursor>;
  if (
    typeof c !== "string" ||
    typeof i !== "string" ||
    !ISO_MICROS_SHAPE.test(c) ||
    !UUID_SHAPE.test(i)
  ) {
    throw invalidCursor();
  }
  return { c, i };
}

/**
 * Real accounts, newest first, keyset-paginated — never an unbounded result
 * set (code-standards.md's pagination rule). The order is the account's
 * creation, which never changes, so a role edit (or anyone's profile edit)
 * cannot move a row between pages while an Admin pages through.
 */
export async function listAdminUsers(
  db: DbClient,
  input: ListAdminUsersInput,
): Promise<AdminUsersPage> {
  const { search, limit, cursor } = listInputSchema.parse(input);
  const filters = [
    ...REAL_ACCOUNT,
    ...(search ? [searchCondition(search)] : []),
  ];
  const decoded = cursor ? decodeCursor(cursor) : null;

  const rows = await db
    .select(SELECTION)
    .from(users)
    .where(
      and(
        ...filters,
        ...(decoded
          ? [
              sql`(${users.createdAt}, ${users.id}) < (${decoded.c}::timestamptz, ${decoded.i}::uuid)`,
            ]
          : []),
      ),
    )
    .orderBy(desc(users.createdAt), desc(users.id))
    // One extra row says whether a next page exists, without a count query.
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  const previous = decoded
    ? await findPreviousPage(db, filters, decoded, limit)
    : { hasPreviousPage: false, previousCursor: null };

  return {
    items: page.map(toRecord),
    nextCursor: hasNextPage && last ? encodeCursor(last) : null,
    ...previous,
  };
}

/**
 * The page *before* the one a cursor starts, from the cursor alone — so
 * "Previous" works on a refresh or a pasted link, with no client-held history.
 *
 * A cursor is the key of the last row of the page before it. That row and
 * everything earlier in the list are read in reverse: the first `limit` of
 * them *are* the previous page, and the `limit + 1`-th, when there is one, is
 * the row that page starts after — its own cursor. With none, the previous page
 * is the first page, which needs no cursor (`null`) but does exist.
 *
 * Keyed on values, not row identity, so it stays right if the cursor's own row
 * was deleted in the meantime.
 */
async function findPreviousPage(
  db: DbClient,
  filters: SQL[],
  cursor: Cursor,
  limit: number,
): Promise<{ hasPreviousPage: boolean; previousCursor: string | null }> {
  const rows = await db
    .select({
      id: users.id,
      createdAt: isoMicros(users.createdAt).as("created_at_iso"),
    })
    .from(users)
    .where(
      and(
        ...filters,
        sql`(${users.createdAt}, ${users.id}) >= (${cursor.c}::timestamptz, ${cursor.i}::uuid)`,
      ),
    )
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(limit + 1);

  const anchor = rows[limit];
  return {
    hasPreviousPage: rows.length > 0,
    previousCursor: anchor ? encodeCursor(anchor) : null,
  };
}

/**
 * Takes the one lock that serializes every role change, held until the
 * surrounding transaction ends. "Is this the last Admin?" and "is the person
 * asking still an Admin?" are only true if nothing else can change a role
 * between the question and the update — counting admins and then updating
 * outside one protection boundary is exactly the bug this exists to prevent
 * (spec 26 §6). Role changes are rare and brief, so one global lock costs
 * nothing, and it is transaction-scoped, so it is safe behind a pooler.
 *
 * Under the surrounding `lock_timeout`, a change that cannot get the lock in
 * time is a retryable conflict, not a fault.
 */
export async function lockRoleChanges(tx: DbClient): Promise<void> {
  try {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('polyglot.users.role-change', 0))`,
    );
  } catch (error) {
    if (isLockTimeout(error)) {
      throw new AppError("IDEMPOTENCY_OPERATION_IN_PROGRESS");
    }
    throw error;
  }
}

/** The role of one account, as the database holds it right now; `null` if there is no such account. */
export async function getUserRole(
  tx: DbClient,
  userId: string,
): Promise<UserRole | null> {
  const [row] = await tx
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role ?? null;
}

/**
 * The account a role change is for, **locked** (`FOR UPDATE`) so nothing else
 * writes to it until the transaction ends, with whether its version token
 * still matches. Compared by the database, as instants, so a token that was
 * formatted differently on the way (trailing zeros dropped) still means the
 * same moment.
 */
export async function getRoleChangeTarget(
  tx: DbClient,
  userId: string,
  expectedUpdatedAt: string,
): Promise<RoleChangeTarget | null> {
  const [row] = await tx
    .select({
      id: users.id,
      role: users.role,
      isSandbox: users.isSandbox,
      clerkUserId: users.clerkUserId,
      versionMatches: sql<boolean>`${users.updatedAt} = ${expectedUpdatedAt}::timestamptz`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    isSandbox: row.isSandbox,
    hasClerkIdentity: row.clerkUserId !== null,
    versionMatches: row.versionMatches,
  };
}

/** How many real accounts hold the Admin role right now. */
export async function countRealAdmins(tx: DbClient): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(...REAL_ACCOUNT, eq(users.role, "admin")));
  return row?.n ?? 0;
}

/** Sets one account's role, advancing its version token. Returns the new role and token. */
export async function setUserRole(
  tx: DbClient,
  userId: string,
  role: UserRole,
): Promise<{ role: UserRole; updatedAt: string }> {
  const [row] = await tx
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning({
      role: users.role,
      updatedAt: isoMicros(users.updatedAt).as("updated_at_iso"),
    });
  if (!row) throw new AppError("ITEM_NOT_FOUND");
  return row;
}
