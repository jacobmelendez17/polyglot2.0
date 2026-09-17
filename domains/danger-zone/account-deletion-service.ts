import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";

import {
  cancelDeletionRequest,
  confirmDeletionRequest,
  createDeletionRequest,
  getActiveDeletionRequest,
  getDueDeletionRequests,
  markDeletionRequestCompleted,
} from "./account-deletion-repository";

/**
 * Spec 20 Delete Account. Deliberately **not** built the way the spec's own
 * mockup literally reads ("Send Delete Confirmation Email" → click a link
 * in that email): no email-delivery infrastructure exists anywhere in this
 * codebase (confirmed while building Notifications, unit 19 — "no
 * email-sending code exists anywhere in this codebase"), and the spec's own
 * scope section for this exact spec names SES/Resend/SendGrid integration
 * as explicitly out of bounds.
 *
 * Two mechanisms were considered for the safety-gate confirmation step
 * itself ("use an authenticated confirmation workflow... prefer the
 * identity provider's supported secure verification/email mechanisms
 * where possible"):
 *
 * 1. Clerk's own reverification/step-up API (`useReverification`,
 *    `auth().has({ reverification })`) — genuinely the closer fit to
 *    "prefer the identity provider's mechanisms," but its own type
 *    definitions mark it explicitly **"currently in public beta. It is
 *    not recommended for production use"** — a real, discovered risk for
 *    this codebase's only account-deletion safety gate, not a
 *    hypothetical one.
 * 2. A typed confirmation phrase inside the learner's already-
 *    Clerk-authenticated session — the same pattern `ResetEntireAccountPanel`
 *    (unit 23) already uses, verified server-side by this domain (the
 *    caller must already have passed `requireUser()`).
 *
 * Option 2 was chosen: still "an authenticated confirmation workflow" (the
 * literal requirement), still no fake/nonexistent email pretending to have
 * been sent, and it does not depend on a beta API for a security-relevant
 * path. `account_deletion_requests` still has no token/hash column at all
 * — there is no Polyglot-issued secret to hash and store, since
 * confirmation never leaves the authenticated session.
 *
 * `createDeletionRequest`/`confirmDeletionRequest`/`cancelDeletionRequest`
 * are each idempotent by construction (a conditional `UPDATE` or an
 * existing-row check, not a raw insert) — the same shape
 * `startVacationPeriod`/`endVacationPeriod` already use, so none of these
 * three need `withIdempotency`'s machinery on top.
 */

export type AccountDeletionStatus =
  | { status: "none" }
  | { status: "pending_confirmation"; requestedAt: Date }
  | { status: "pending_deletion"; deleteAfter: Date };

export async function getAccountDeletionStatus(
  db: DbClient,
  userId: string,
): Promise<AccountDeletionStatus> {
  const request = await getActiveDeletionRequest(db, userId);
  if (!request) return { status: "none" };
  if (!request.confirmedAt || !request.deleteAfter)
    return { status: "pending_confirmation", requestedAt: request.requestedAt };
  return { status: "pending_deletion", deleteAfter: request.deleteAfter };
}

export type RequestAccountDeletionInput = { userId: string; now?: Date };

/** Spec 20 Delete Account — the initial "Send Delete Confirmation Email" button. "The initial button does not immediately delete the account." */
export async function requestAccountDeletion(
  db: DbClient,
  input: RequestAccountDeletionInput,
): Promise<{ requestedAt: Date }> {
  const now = input.now ?? new Date();
  const request = await createDeletionRequest(db, {
    userId: input.userId,
    now,
  });
  return { requestedAt: request.requestedAt };
}

const PENDING_DELETION_WINDOW_DAYS = 7;

export type ConfirmAccountDeletionInput = { userId: string; now?: Date };

/** Spec 20 Delete Confirmation — "account enters pending deletion with a 7-day recovery period." */
export async function confirmAccountDeletion(
  db: DbClient,
  input: ConfirmAccountDeletionInput,
): Promise<{ deleteAfter: Date }> {
  const now = input.now ?? new Date();
  const deleteAfter = new Date(
    now.getTime() + PENDING_DELETION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const request = await confirmDeletionRequest(db, {
    userId: input.userId,
    now,
    deleteAfter,
  });
  if (!request?.deleteAfter) {
    throw new AppError(
      "ITEM_NOT_FOUND",
      "There is no pending account-deletion request to confirm.",
    );
  }
  return { deleteAfter: request.deleteAfter };
}

export type CancelAccountDeletionInput = { userId: string; now?: Date };

/** Spec 20 Pending Deletion — "require explicit cancellation." Idempotent: cancelling twice, or cancelling when there is nothing active, is a safe no-op. */
export async function cancelAccountDeletion(
  db: DbClient,
  input: CancelAccountDeletionInput,
): Promise<{ cancelled: boolean }> {
  const now = input.now ?? new Date();
  const request = await cancelDeletionRequest(db, {
    userId: input.userId,
    now,
  });
  return { cancelled: request !== null };
}

export type FinalizeDueAccountDeletionsInput = {
  now: Date;
  /** Injected so this stays testable without a real Clerk API call — must itself be tolerant of an already-deleted Clerk user (idempotent). `null` when the account has no Clerk identity (a sandbox persona — should never itself reach here, but handled rather than assumed). */
  deleteClerkUser: (clerkUserId: string | null) => Promise<void>;
};

/**
 * Spec 20 Permanent Account Deletion — the Vercel Cron finalize job's core
 * logic. "Coordinate deletion across: Polyglot database, Clerk identity" —
 * Clerk is deleted first, then the `users` row (whose `onDelete: cascade`/
 * `restrict` foreign keys handle every dependent table exactly as
 * `domains/danger-zone/account-reset-repository.ts`'s docstring explains
 * for Reset Entire Account, except here the `users` row itself goes too).
 * One request at a time, each in its own transaction, so one request's
 * failure (a network error calling Clerk, or a `restrict` constraint from
 * real admin-authored history this account has) never blocks the others —
 * "deletion must be idempotent," so a failed request simply stays due and
 * retries on tomorrow's run.
 */
export async function finalizeDueAccountDeletions(
  db: DbClient,
  input: FinalizeDueAccountDeletionsInput,
): Promise<{ processedCount: number; failedCount: number }> {
  const due = await getDueDeletionRequests(db, input.now);
  let processedCount = 0;
  let failedCount = 0;

  for (const request of due) {
    try {
      await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, request.userId))
          .limit(1);
        if (user) {
          await input.deleteClerkUser(user.clerkUserId);
          await tx.delete(users).where(eq(users.id, request.userId));
        }
        await markDeletionRequestCompleted(tx, {
          requestId: request.id,
          now: input.now,
        });
      });
      processedCount += 1;
    } catch (error) {
      console.error(
        `Failed to finalize account deletion request ${request.id}`,
        error,
      );
      failedCount += 1;
    }
  }

  return { processedCount, failedCount };
}
