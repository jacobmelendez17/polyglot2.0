import { lt } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";

/** Deletes idempotency key rows past `expiresAt` (spec 08 §53's Retention section). Returns the count removed. */
export async function cleanupExpiredIdempotencyKeys(db: DbClient, now: Date = new Date()): Promise<number> {
  const deleted = await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, now)).returning({ id: idempotencyKeys.id });
  return deleted.length;
}
