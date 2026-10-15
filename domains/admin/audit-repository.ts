import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { adminAuditEvents } from "@/db/schema";
import { AdminError } from "@/lib/errors/admin-errors";

import {
  getAuditEventsInputSchema,
  recordAuditEventInputSchema,
} from "./audit-schemas";
import type {
  AdminAuditEvent,
  AuditEventsPage,
  GetAuditEventsInput,
  RecordAuditEventInput,
} from "./audit-types";

/**
 * Admin audit persistence (spec 11 §47/§49) — takes an injected `DbClient`,
 * not the `db` singleton, matching every other repository in this codebase
 * (`domains/srs/review-repository.ts`, `domains/progress/repository.ts`).
 * `recordAuditEvent` is meant to be called from inside whichever
 * transaction performs the mutation it records, once later units have a
 * real mutation to audit — this domain does not own or open that
 * transaction itself.
 */

type AdminAuditEventRow = typeof adminAuditEvents.$inferSelect;

function toAdminAuditEvent(row: AdminAuditEventRow): AdminAuditEvent {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action as AdminAuditEvent["action"],
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    beforeData: row.beforeData,
    afterData: row.afterData,
    reason: row.reason,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}

export async function recordAuditEvent(
  db: DbClient,
  input: RecordAuditEventInput,
): Promise<AdminAuditEvent> {
  const parsed = recordAuditEventInputSchema.parse(input);
  const [row] = await db
    .insert(adminAuditEvents)
    .values({
      actorUserId: parsed.actorUserId,
      action: parsed.action,
      resourceType: parsed.resourceType,
      resourceId: parsed.resourceId ?? null,
      beforeData: parsed.beforeData ?? null,
      afterData: parsed.afterData ?? null,
      reason: parsed.reason ?? null,
      correlationId: parsed.correlationId ?? null,
      ...(parsed.createdAt ? { createdAt: parsed.createdAt } : {}),
    })
    .returning();
  return toAdminAuditEvent(row);
}

/**
 * A timestamp as microsecond-precision ISO text in UTC. Postgres keeps
 * microseconds and JavaScript's `Date` only milliseconds, so a keyset cursor
 * that has to match a row *exactly* travels as this text instead of being
 * rounded through a `Date`. Rounded, it skips every event that shares the cursor
 * row's instant — and events written in one transaction (a bulk publish, an
 * import's commit) all carry the transaction's single `now()`, so a page that
 * ends among them lost the rest of the group from the log. Same reasoning, and
 * same SQL, as the import history's and the account list's cursors.
 */
const isoMicros = (column: AnyColumn) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_MICROS_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Opaque keyset cursor over `(created_at desc, id desc)` — never expose the raw timestamp/id pair directly (code-standards.md's pagination rule). The timestamp keeps its microseconds. */
type Cursor = { c: string; i: string };

function encodeCursor(row: { createdAt: string; id: string }): string {
  const cursor: Cursor = { c: row.createdAt, i: row.id };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function invalidCursor(): AdminError {
  return new AdminError(
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
 * Keyset-paginated, filterable audit log (spec 11 §49), newest first —
 * never an unbounded result set. Filters combine with AND.
 *
 * A cursor is the key of the last event of the page before it. `hasPreviousPage`
 * and `previousCursor` are computed from that cursor alone, so "Previous" works
 * on a refresh or a pasted link with no client-held history. An event's
 * `created_at` and id never change, so nothing moves between pages while
 * someone reads — new events only appear at the top, before the first page.
 */
export async function getAuditEvents(
  db: DbClient,
  input: GetAuditEventsInput,
): Promise<AuditEventsPage> {
  const {
    actorUserId,
    action,
    resourceType,
    resourceId,
    from,
    to,
    limit,
    cursor,
  } = getAuditEventsInputSchema.parse(input);

  const filters: SQL[] = [];
  if (actorUserId) filters.push(eq(adminAuditEvents.actorUserId, actorUserId));
  if (action) filters.push(eq(adminAuditEvents.action, action));
  if (resourceType)
    filters.push(eq(adminAuditEvents.resourceType, resourceType));
  if (resourceId) filters.push(eq(adminAuditEvents.resourceId, resourceId));
  if (from) filters.push(gte(adminAuditEvents.createdAt, from));
  if (to) filters.push(lte(adminAuditEvents.createdAt, to));

  const decoded = cursor ? decodeCursor(cursor) : null;

  // One extra row says whether a next page exists, without a count query.
  const rows = await db
    .select({
      row: adminAuditEvents,
      createdAtIso: isoMicros(adminAuditEvents.createdAt).as("created_at_iso"),
    })
    .from(adminAuditEvents)
    .where(
      and(
        ...filters,
        ...(decoded
          ? [
              sql`(${adminAuditEvents.createdAt}, ${adminAuditEvents.id}) < (${decoded.c}::timestamptz, ${decoded.i}::uuid)`,
            ]
          : []),
      ),
    )
    .orderBy(desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  const previous = decoded
    ? await findPreviousPage(db, filters, decoded, limit)
    : { hasPreviousPage: false, previousCursor: null };

  return {
    items: pageRows.map(({ row }) => toAdminAuditEvent(row)),
    nextCursor:
      hasNextPage && last
        ? encodeCursor({ createdAt: last.createdAtIso, id: last.row.id })
        : null,
    ...previous,
  };
}

/**
 * The page *before* the one a cursor starts. The cursor row and everything
 * newer (same filters) are read in reverse: the first `limit` of them *are* the
 * previous page, and the `limit + 1`-th, when there is one, is the event that
 * page starts after — its own cursor. With none, the previous page is the first
 * page, which needs no cursor (`null`) but does exist.
 *
 * Keyed on values, not row identity, so it stays right if the cursor's own event
 * is gone (nothing deletes audit events, but a cursor must not depend on that).
 */
async function findPreviousPage(
  db: DbClient,
  filters: SQL[],
  cursor: Cursor,
  limit: number,
): Promise<{ hasPreviousPage: boolean; previousCursor: string | null }> {
  const rows = await db
    .select({
      id: adminAuditEvents.id,
      createdAt: isoMicros(adminAuditEvents.createdAt).as("created_at_iso"),
    })
    .from(adminAuditEvents)
    .where(
      and(
        ...filters,
        sql`(${adminAuditEvents.createdAt}, ${adminAuditEvents.id}) >= (${cursor.c}::timestamptz, ${cursor.i}::uuid)`,
      ),
    )
    .orderBy(asc(adminAuditEvents.createdAt), asc(adminAuditEvents.id))
    .limit(limit + 1);

  const anchor = rows[limit];
  return {
    hasPreviousPage: rows.length > 0,
    previousCursor: anchor ? encodeCursor(anchor) : null,
  };
}
