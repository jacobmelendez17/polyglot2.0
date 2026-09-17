import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Spec 11's sandbox clock abstraction: "real server time: unchanged /
 * sandbox perceived time: +7 days".
 *
 * Every authoritative learner flow in this codebase already follows the
 * "caller supplies `now`" invariant — SRS scheduling, review due-ness, and
 * lesson enrollment all take an explicit timestamp rather than reading the
 * clock themselves. That is what makes a per-user clock a small change
 * instead of a cross-cutting one: the service bindings resolve `now` here
 * and pass it down, and nothing deeper needs to know a sandbox exists.
 *
 * For an ordinary learner this is exactly real server time. Only a sandbox
 * persona can carry an offset, enforced by a check constraint on the column
 * itself, so no amount of misuse can shift a real user's clock.
 */

/** Resolves the perceived current time for one user. `realNow` is injectable for deterministic tests. */
export async function resolveUserNow(
  db: DbClient,
  userId: string,
  realNow: Date = new Date(),
): Promise<Date> {
  const [row] = await db
    .select({ offsetSeconds: users.sandboxTimeOffsetSeconds })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const offsetSeconds = row?.offsetSeconds ?? 0;
  return offsetSeconds === 0
    ? realNow
    : new Date(realNow.getTime() + offsetSeconds * 1000);
}

/** Sets a sandbox persona's clock offset. Rejected by the database's own check constraint for a non-sandbox user. */
export async function setSandboxTimeOffset(
  db: DbClient,
  sandboxUserId: string,
  offsetSeconds: number,
): Promise<void> {
  await db
    .update(users)
    .set({ sandboxTimeOffsetSeconds: offsetSeconds })
    .where(eq(users.id, sandboxUserId));
}

export async function getSandboxTimeOffset(
  db: DbClient,
  sandboxUserId: string,
): Promise<number> {
  const [row] = await db
    .select({ offsetSeconds: users.sandboxTimeOffsetSeconds })
    .from(users)
    .where(eq(users.id, sandboxUserId))
    .limit(1);
  return row?.offsetSeconds ?? 0;
}
