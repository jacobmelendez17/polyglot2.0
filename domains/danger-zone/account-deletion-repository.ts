import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { accountDeletionRequests } from "@/db/schema";

export type AccountDeletionRequest = {
  id: string;
  userId: string;
  requestedAt: Date;
  confirmedAt: Date | null;
  deleteAfter: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
};

function toAccountDeletionRequest(
  row: typeof accountDeletionRequests.$inferSelect,
): AccountDeletionRequest {
  return {
    id: row.id,
    userId: row.userId,
    requestedAt: row.requestedAt,
    confirmedAt: row.confirmedAt,
    deleteAfter: row.deleteAfter,
    cancelledAt: row.cancelledAt,
    completedAt: row.completedAt,
  };
}

/** The one live request for this user — neither cancelled nor completed — or `null`. There is at most one by construction (`account_deletion_requests_one_active_per_user`). */
export async function getActiveDeletionRequest(
  db: DbClient,
  userId: string,
): Promise<AccountDeletionRequest | null> {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        isNull(accountDeletionRequests.cancelledAt),
        isNull(accountDeletionRequests.completedAt),
      ),
    )
    .limit(1);
  return row ? toAccountDeletionRequest(row) : null;
}

/**
 * Idempotent start — a repeat call with an already-active request returns
 * it unchanged, the same "enabling twice creates no duplicate" shape
 * `startVacationPeriod` uses. The unique partial index is the actual
 * concurrency guarantee; this check is the fast, common-case path.
 */
export async function createDeletionRequest(
  db: DbClient,
  input: { userId: string; now: Date },
): Promise<AccountDeletionRequest> {
  const existing = await getActiveDeletionRequest(db, input.userId);
  if (existing) return existing;

  const [row] = await db
    .insert(accountDeletionRequests)
    .values({ userId: input.userId, requestedAt: input.now })
    .returning();
  return toAccountDeletionRequest(row);
}

/** Moves an unconfirmed request into "pending deletion" — sets `confirmedAt`/`deleteAfter` together, the one moment those two columns are ever written. Returns `null` if there is no such request to confirm (already confirmed, cancelled, or never requested). */
export async function confirmDeletionRequest(
  db: DbClient,
  input: { userId: string; now: Date; deleteAfter: Date },
): Promise<AccountDeletionRequest | null> {
  const [row] = await db
    .update(accountDeletionRequests)
    .set({
      confirmedAt: input.now,
      deleteAfter: input.deleteAfter,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(accountDeletionRequests.userId, input.userId),
        isNull(accountDeletionRequests.confirmedAt),
        isNull(accountDeletionRequests.cancelledAt),
        isNull(accountDeletionRequests.completedAt),
      ),
    )
    .returning();
  return row ? toAccountDeletionRequest(row) : null;
}

/** Idempotent end — "the user may cancel at any time before delete_after"; a repeat call finds no active row and returns `null`, the same shape `endVacationPeriod` uses. Works whether or not the request was ever confirmed. */
export async function cancelDeletionRequest(
  db: DbClient,
  input: { userId: string; now: Date },
): Promise<AccountDeletionRequest | null> {
  const [row] = await db
    .update(accountDeletionRequests)
    .set({ cancelledAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(accountDeletionRequests.userId, input.userId),
        isNull(accountDeletionRequests.cancelledAt),
        isNull(accountDeletionRequests.completedAt),
      ),
    )
    .returning();
  return row ? toAccountDeletionRequest(row) : null;
}

/** Spec 20 "Permanent Account Deletion" — every confirmed request whose 7-day window has passed, not yet cancelled or completed. The Vercel Cron finalize job's own query. */
export async function getDueDeletionRequests(
  db: DbClient,
  now: Date,
): Promise<AccountDeletionRequest[]> {
  const rows = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        isNotNull(accountDeletionRequests.confirmedAt),
        isNull(accountDeletionRequests.cancelledAt),
        isNull(accountDeletionRequests.completedAt),
        lte(accountDeletionRequests.deleteAfter, now),
      ),
    );
  return rows.map(toAccountDeletionRequest);
}

export async function markDeletionRequestCompleted(
  db: DbClient,
  input: { requestId: string; now: Date },
): Promise<void> {
  await db
    .update(accountDeletionRequests)
    .set({ completedAt: input.now, updatedAt: input.now })
    .where(eq(accountDeletionRequests.id, input.requestId));
}
