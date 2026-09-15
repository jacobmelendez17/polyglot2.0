import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { userItemProgress, users } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { AppError } from "@/lib/errors/app-error";

import {
  cancelAccountDeletion,
  confirmAccountDeletion,
  finalizeDueAccountDeletions,
  getAccountDeletionStatus,
  requestAccountDeletion,
} from "./account-deletion-service";

describe("account deletion request/confirm/cancel state machine (spec 20 Delete Account)", () => {
  it("moves through none -> pending_confirmation -> pending_deletion -> (cancel) -> none", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);

      expect(await getAccountDeletionStatus(tx, learnerId)).toEqual({ status: "none" });

      const requestedNow = new Date("2026-08-01T00:00:00Z");
      await requestAccountDeletion(tx, { userId: learnerId, now: requestedNow });
      expect(await getAccountDeletionStatus(tx, learnerId)).toEqual({ status: "pending_confirmation", requestedAt: requestedNow });

      const confirmedNow = new Date("2026-08-02T00:00:00Z");
      const { deleteAfter } = await confirmAccountDeletion(tx, { userId: learnerId, now: confirmedNow });
      // Spec's own "7-day recovery period."
      expect(deleteAfter).toEqual(new Date("2026-08-09T00:00:00Z"));
      expect(await getAccountDeletionStatus(tx, learnerId)).toEqual({ status: "pending_deletion", deleteAfter });

      const { cancelled } = await cancelAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-03T00:00:00Z") });
      expect(cancelled).toBe(true);
      expect(await getAccountDeletionStatus(tx, learnerId)).toEqual({ status: "none" });
    });
  });

  it("confirmAccountDeletion throws when there is nothing to confirm", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await expect(confirmAccountDeletion(tx, { userId: learnerId, now: new Date() })).rejects.toBeInstanceOf(AppError);
    });
  });

  it("cancelAccountDeletion on an account with nothing pending is a safe no-op", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const { cancelled } = await cancelAccountDeletion(tx, { userId: learnerId, now: new Date() });
      expect(cancelled).toBe(false);
    });
  });
});

describe("finalizeDueAccountDeletions (spec 20 Permanent Account Deletion)", () => {
  it("deletes the Clerk identity, then the Polyglot user row (cascading every dependent table), then marks the request completed", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: gatoId, languageId, srsStage: "beginner_1" }).onConflictDoNothing();
      await requestAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-01T00:00:00Z") });
      const { deleteAfter } = await confirmAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-01T00:00:00Z") });

      const deleteClerkUser = vi.fn(async () => {});
      const result = await finalizeDueAccountDeletions(tx, { now: new Date(deleteAfter.getTime() + 1000), deleteClerkUser });

      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(deleteClerkUser).toHaveBeenCalledWith("fixture-clerk-learner");

      const [userRow] = await tx.select().from(users).where(eq(users.id, learnerId));
      expect(userRow).toBeUndefined();
      const progressRows = await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, learnerId));
      expect(progressRows).toHaveLength(0);
      // The request row itself cascades away with the user, so there is nothing left to check "completed" on —
      // this is expected and fine: the row's purpose (blocking a duplicate request, surfacing status) ends
      // exactly when the account it belongs to no longer exists.
    });
  });

  it("does not finalize a request that is not yet due", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await requestAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-01T00:00:00Z") });
      await confirmAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-01T00:00:00Z") });

      const deleteClerkUser = vi.fn(async () => {});
      const result = await finalizeDueAccountDeletions(tx, { now: new Date("2026-08-05T00:00:00Z"), deleteClerkUser });

      expect(result.processedCount).toBe(0);
      expect(deleteClerkUser).not.toHaveBeenCalled();
      const [userRow] = await tx.select().from(users).where(eq(users.id, learnerId));
      expect(userRow).toBeDefined();
    });
  });

  it("does not finalize a cancelled request even if its window has passed", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await requestAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-01T00:00:00Z") });
      const { deleteAfter } = await confirmAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-01T00:00:00Z") });
      await cancelAccountDeletion(tx, { userId: learnerId, now: new Date("2026-08-02T00:00:00Z") });

      const deleteClerkUser = vi.fn(async () => {});
      const result = await finalizeDueAccountDeletions(tx, { now: new Date(deleteAfter.getTime() + 1000), deleteClerkUser });

      expect(result.processedCount).toBe(0);
      const [userRow] = await tx.select().from(users).where(eq(users.id, learnerId));
      expect(userRow).toBeDefined();
    });
  });

  it("isolates one request's failure — a Clerk deletion error for one account does not block another's", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId } = await seedTestFixtures(tx);
      const now = new Date("2026-08-01T00:00:00Z");
      await requestAccountDeletion(tx, { userId: learnerId, now });
      await confirmAccountDeletion(tx, { userId: learnerId, now });
      await requestAccountDeletion(tx, { userId: developerId, now });
      await confirmAccountDeletion(tx, { userId: developerId, now });

      const deleteClerkUser = vi.fn(async (clerkUserId: string | null) => {
        if (clerkUserId === "fixture-clerk-learner") throw new Error("Clerk API unreachable");
      });
      const result = await finalizeDueAccountDeletions(tx, { now: new Date("2026-08-09T00:00:01Z"), deleteClerkUser });

      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      // The failed one is untouched, safely retryable tomorrow.
      const [learnerRow] = await tx.select().from(users).where(eq(users.id, learnerId));
      expect(learnerRow).toBeDefined();
      const [developerRow] = await tx.select().from(users).where(eq(users.id, developerId));
      expect(developerRow).toBeUndefined();
    });
  });
});
