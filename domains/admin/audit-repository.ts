import { and, desc, eq, gte, lt, lte, or } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { adminAuditEvents } from "@/db/schema";

import { getAuditEventsInputSchema, recordAuditEventInputSchema } from "./audit-schemas";
import type { AdminAuditEvent, AuditEventsPage, GetAuditEventsInput, RecordAuditEventInput } from "./audit-types";

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

export async function recordAuditEvent(db: DbClient, input: RecordAuditEventInput): Promise<AdminAuditEvent> {
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

/** Opaque keyset cursor over `(created_at desc, id desc)` — never expose the raw timestamp/id pair directly (code-standards.md's pagination rule). */
type Cursor = { createdAt: string; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") {
    throw new Error("Invalid audit event cursor");
  }
  return parsed;
}

/**
 * Keyset-paginated, filterable audit log (spec 11 §49), newest first —
 * never an unbounded result set. Filters combine with AND.
 */
export async function getAuditEvents(db: DbClient, input: GetAuditEventsInput): Promise<AuditEventsPage> {
  const { actorUserId, action, resourceType, resourceId, from, to, limit, cursor } = getAuditEventsInputSchema.parse(input);

  const conditions = [];
  if (actorUserId) conditions.push(eq(adminAuditEvents.actorUserId, actorUserId));
  if (action) conditions.push(eq(adminAuditEvents.action, action));
  if (resourceType) conditions.push(eq(adminAuditEvents.resourceType, resourceType));
  if (resourceId) conditions.push(eq(adminAuditEvents.resourceId, resourceId));
  if (from) conditions.push(gte(adminAuditEvents.createdAt, from));
  if (to) conditions.push(lte(adminAuditEvents.createdAt, to));

  if (cursor) {
    const decoded = decodeCursor(cursor);
    const cursorCreatedAt = new Date(decoded.createdAt);
    conditions.push(
      or(
        lt(adminAuditEvents.createdAt, cursorCreatedAt),
        and(eq(adminAuditEvents.createdAt, cursorCreatedAt), lt(adminAuditEvents.id, decoded.id)),
      )!,
    );
  }

  // Fetch one extra row to know whether a next page exists, without a
  // separate count query.
  const rows = await db
    .select()
    .from(adminAuditEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toAdminAuditEvent),
    nextCursor:
      hasNextPage && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}
