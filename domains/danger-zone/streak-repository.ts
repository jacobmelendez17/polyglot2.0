import { desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userStreakAdjustments } from "@/db/schema";

export type StreakAdjustment = { id: string; userId: string; value: number; createdAt: Date };

function toStreakAdjustment(row: typeof userStreakAdjustments.$inferSelect): StreakAdjustment {
  return { id: row.id, userId: row.userId, value: row.value, createdAt: row.createdAt };
}

/**
 * Spec 20 Danger Zone — Manually Set Streak. Always a fresh row, never an
 * upsert — "Store an explicit streak adjustment/base record," and an
 * append-only history is the record of every time a learner did this, not
 * just the latest value (see `db/schema/user-settings.ts`'s
 * `userStreakAdjustments` docstring).
 */
export async function insertStreakAdjustment(db: DbClient, input: { userId: string; value: number; now: Date }): Promise<StreakAdjustment> {
  const [row] = await db
    .insert(userStreakAdjustments)
    .values({ userId: input.userId, value: input.value, createdAt: input.now, updatedAt: input.now })
    .returning();
  return toStreakAdjustment(row);
}

/** The most recent manual streak adjustment for this learner, or `null` if they have never set one. */
export async function getLatestStreakAdjustment(db: DbClient, userId: string): Promise<StreakAdjustment | null> {
  const [row] = await db
    .select()
    .from(userStreakAdjustments)
    .where(eq(userStreakAdjustments.userId, userId))
    .orderBy(desc(userStreakAdjustments.createdAt))
    .limit(1);
  return row ? toStreakAdjustment(row) : null;
}
