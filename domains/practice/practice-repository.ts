import { and, eq, gte, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { practiceSessions } from "@/db/schema";

import type { PracticeTypeActivity } from "./practice-types";

/**
 * One learner's practice history for one language, one row per practice type
 * they have ever completed. Aggregated in SQL so the hub never pulls raw
 * session rows: unbounded history is reduced to at most one row per type.
 *
 * `since` bounds only the recent-session count; `lastCompletedAt` looks at
 * the learner's whole history, so "2 weeks ago" still shows for a practice
 * not touched in the recent window.
 */
export async function getPracticeActivity(
  db: DbClient,
  userId: string,
  languageId: string,
  since: Date,
): Promise<PracticeTypeActivity[]> {
  const rows = await db
    .select({
      practiceType: practiceSessions.practiceType,
      recentSessionCount:
        sql<number>`count(*) filter (where ${gte(practiceSessions.completedAt, since)})`
          .mapWith(Number)
          .as("recent_session_count"),
      lastCompletedAt: sql<Date>`max(${practiceSessions.completedAt})`
        .mapWith((value: string | Date) => new Date(value))
        .as("last_completed_at"),
    })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, userId),
        eq(practiceSessions.languageId, languageId),
      ),
    )
    .groupBy(practiceSessions.practiceType);

  return rows;
}
