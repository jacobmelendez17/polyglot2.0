import { and, desc, eq, isNull } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userVacationPeriods } from "@/db/schema";

export type VacationPeriod = {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
};

function toVacationPeriod(row: typeof userVacationPeriods.$inferSelect): VacationPeriod {
  return { id: row.id, userId: row.userId, startedAt: row.startedAt, endedAt: row.endedAt };
}

/**
 * Every vacation period a learner has ever had, past and active alike —
 * spec 20 "Vacation and Streaks" ("vacation days are neutral... the
 * learner's streak continues across the vacation") needs the *whole*
 * history to mark old vacation-neutral calendar days, not just whether one
 * is active right now, unlike every other vacation-repository function
 * here.
 */
export async function getVacationPeriodsForUser(db: DbClient, userId: string): Promise<VacationPeriod[]> {
  const rows = await db.select().from(userVacationPeriods).where(eq(userVacationPeriods.userId, userId)).orderBy(desc(userVacationPeriods.startedAt));
  return rows.map(toVacationPeriod);
}

/** The learner's currently active vacation period, or `null` when not on vacation. */
export async function findActiveVacationPeriod(db: DbClient, userId: string): Promise<VacationPeriod | null> {
  const [row] = await db
    .select()
    .from(userVacationPeriods)
    .where(and(eq(userVacationPeriods.userId, userId), isNull(userVacationPeriods.endedAt)))
    .orderBy(desc(userVacationPeriods.startedAt))
    .limit(1);
  return row ? toVacationPeriod(row) : null;
}

/**
 * Idempotent start (spec 20 Vacation Concurrency: "enabling Vacation Mode
 * twice should not create duplicate active periods"). Returns the existing
 * active period unchanged if one already exists — `user_vacation_periods
 * _one_active_per_user` (the partial unique index) is the actual
 * concurrency guarantee this relies on, not this check alone; a race that
 * slips past it fails the insert with a unique violation rather than
 * silently duplicating a period.
 */
export async function startVacationPeriod(db: DbClient, userId: string, startedAt: Date): Promise<VacationPeriod> {
  const existing = await findActiveVacationPeriod(db, userId);
  if (existing) return existing;

  const [row] = await db.insert(userVacationPeriods).values({ userId, startedAt }).returning();
  return toVacationPeriod(row);
}

/**
 * Idempotent end (spec 20 Vacation Concurrency: "disabling it twice should
 * not shift review due dates twice"). Returns `null` when there was no
 * active period to close — the caller (`user-service.ts`'s
 * `disableVacationMode`) reads that as "already off" and skips the
 * schedule-reconciliation step entirely, which is what makes a repeated
 * disable a true no-op rather than a second, incorrect adjustment.
 */
export async function endVacationPeriod(db: DbClient, userId: string, endedAt: Date): Promise<VacationPeriod | null> {
  const [row] = await db
    .update(userVacationPeriods)
    .set({ endedAt, updatedAt: new Date() })
    .where(and(eq(userVacationPeriods.userId, userId), isNull(userVacationPeriods.endedAt)))
    .returning();
  return row ? toVacationPeriod(row) : null;
}
