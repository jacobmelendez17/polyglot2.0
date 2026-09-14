import { db } from "@/db/client";
import { applyVacationSchedulingAdjustment } from "@/domains/progress/repository";
import { applyGhostVacationSchedulingAdjustment } from "@/domains/srs/ghost-repository";
import { getRateLimiter } from "@/providers/rate-limit";
import { AppError } from "@/lib/errors/app-error";

import { endVacationPeriod, findActiveVacationPeriod, startVacationPeriod } from "./vacation-repository";
import type { VacationPeriod } from "./vacation-repository";

export type { VacationPeriod };

/** Whether this learner is currently on vacation — the gate `domains/progress`'s due-review read binds to (spec 20: "review availability is paused"). */
export async function isVacationModeActive(userId: string): Promise<boolean> {
  return (await findActiveVacationPeriod(db, userId)) !== null;
}

async function checkAccountSettingsRateLimit(userId: string): Promise<void> {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
}

/** Idempotent enable (spec 20 Vacation Concurrency) — see `startVacationPeriod`. */
export async function enableVacationMode(userId: string, now: Date = new Date()): Promise<VacationPeriod> {
  await checkAccountSettingsRateLimit(userId);
  return startVacationPeriod(db, userId, now);
}

/**
 * Idempotent disable, and the one place spec 20's Vacation Scheduling rule
 * actually gets applied to real progress rows. Closing the vacation period
 * and reconciling every affected `next_review_at` — both normal items and,
 * per spec 20's "Vacation and Ghosts" ("Apply equivalent freeze behavior to
 * Ghost Review due dates"), due Ghost reviews — happen in one transaction:
 * "schedule adjustment at vacation end must happen exactly once" requires
 * all three to commit together or not at all, not writes a crash between
 * them could split.
 *
 * Returns `null` when there was nothing active to close (already off);
 * the reconciliation steps are skipped entirely in that case, which is what
 * makes a repeated disable produce zero additional schedule shift.
 */
export async function disableVacationMode(userId: string, now: Date = new Date()): Promise<VacationPeriod | null> {
  await checkAccountSettingsRateLimit(userId);

  return db.transaction(async (tx) => {
    const closed = await endVacationPeriod(tx, userId, now);
    if (!closed) return null;

    await applyVacationSchedulingAdjustment(tx, userId, closed.startedAt, now);
    await applyGhostVacationSchedulingAdjustment(tx, userId, closed.startedAt, now);
    return closed;
  });
}
