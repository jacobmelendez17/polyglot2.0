import { and, desc, eq, lt, or } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { reviewEvents } from "@/db/schema";

import type { GetReviewHistoryInput, InsertReviewEventInput, ReviewEvent, ReviewHistoryPage } from "./review-history-types";

/**
 * Review-event persistence (spec 09 §14) — takes an injected `DbClient`, not
 * the `db` singleton, matching every other repository in this codebase
 * (`domains/progress/repository.ts`, `domains/users/user-repository.ts`).
 * `insertReviewEvent` is meant to be called from inside the atomic
 * review-completion transaction (spec 09 §10, implemented in a later unit),
 * so it accepts whichever `DbClient` that transaction is already using.
 */

type ReviewEventRow = typeof reviewEvents.$inferSelect;

function toReviewEvent(row: ReviewEventRow): ReviewEvent {
  return {
    id: row.id,
    userId: row.userId,
    languageId: row.languageId,
    learningItemId: row.learningItemId,
    reviewedAt: row.reviewedAt,
    stageBefore: row.stageBefore,
    stageAfter: row.stageAfter,
    requiredQuestionCount: row.requiredQuestionCount,
    incorrectAdjustmentCount: row.incorrectAdjustmentCount,
    result: row.result,
    createdAt: row.createdAt,
  };
}

export async function insertReviewEvent(db: DbClient, input: InsertReviewEventInput): Promise<ReviewEvent> {
  const [row] = await db.insert(reviewEvents).values(input).returning();
  return toReviewEvent(row);
}

/** Opaque keyset cursor over `(reviewed_at desc, id desc)` — never expose the raw timestamp/id pair directly (code-standards.md's pagination rule). */
type Cursor = { reviewedAt: string; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (typeof parsed?.reviewedAt !== "string" || typeof parsed?.id !== "string") {
    throw new Error("Invalid review history cursor");
  }
  return parsed;
}

/**
 * Keyset-paginated review history for one user/language, newest first
 * (spec 09 §14 — never an unbounded result set). Exercises
 * `review_events_history_idx`.
 */
export async function getReviewHistory(db: DbClient, input: GetReviewHistoryInput): Promise<ReviewHistoryPage> {
  const { userId, languageId, limit, cursor } = input;
  const conditions = [eq(reviewEvents.userId, userId), eq(reviewEvents.languageId, languageId)];

  if (cursor) {
    const decoded = decodeCursor(cursor);
    const cursorReviewedAt = new Date(decoded.reviewedAt);
    conditions.push(
      or(
        lt(reviewEvents.reviewedAt, cursorReviewedAt),
        and(eq(reviewEvents.reviewedAt, cursorReviewedAt), lt(reviewEvents.id, decoded.id)),
      )!,
    );
  }

  // Fetch one extra row to know whether a next page exists, without a
  // separate count query.
  const rows = await db
    .select()
    .from(reviewEvents)
    .where(and(...conditions))
    .orderBy(desc(reviewEvents.reviewedAt), desc(reviewEvents.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toReviewEvent),
    nextCursor:
      hasNextPage && last ? encodeCursor({ reviewedAt: last.reviewedAt.toISOString(), id: last.id }) : null,
  };
}
