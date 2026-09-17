import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  cancelDeletionRequest,
  confirmDeletionRequest,
  createDeletionRequest,
  getActiveDeletionRequest,
  getDueDeletionRequests,
  markDeletionRequestCompleted,
} from "./account-deletion-repository";

describe("account-deletion-repository", () => {
  it("createDeletionRequest is idempotent — a repeat call returns the same active request", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const now = new Date("2026-08-01T00:00:00Z");

      const first = await createDeletionRequest(tx, { userId: learnerId, now });
      const second = await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-02T00:00:00Z"),
      });

      expect(second.id).toBe(first.id);
      expect(second.requestedAt).toEqual(first.requestedAt);
    });
  });

  it("getActiveDeletionRequest finds an unconfirmed request", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const now = new Date("2026-08-01T00:00:00Z");
      const created = await createDeletionRequest(tx, {
        userId: learnerId,
        now,
      });

      const active = await getActiveDeletionRequest(tx, learnerId);
      expect(active?.id).toBe(created.id);
      expect(active?.confirmedAt).toBeNull();
    });
  });

  it("confirmDeletionRequest sets confirmedAt/deleteAfter together, and returns null for a non-active request", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const requestedAt = new Date("2026-08-01T00:00:00Z");
      const confirmedAt = new Date("2026-08-02T00:00:00Z");
      const deleteAfter = new Date("2026-08-09T00:00:00Z");
      await createDeletionRequest(tx, { userId: learnerId, now: requestedAt });

      const confirmed = await confirmDeletionRequest(tx, {
        userId: learnerId,
        now: confirmedAt,
        deleteAfter,
      });
      expect(confirmed?.confirmedAt).toEqual(confirmedAt);
      expect(confirmed?.deleteAfter).toEqual(deleteAfter);

      // Already confirmed — a second confirm attempt finds nothing to confirm.
      const secondAttempt = await confirmDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-03T00:00:00Z"),
        deleteAfter,
      });
      expect(secondAttempt).toBeNull();
    });
  });

  it("confirmDeletionRequest returns null when there is no request at all", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const result = await confirmDeletionRequest(tx, {
        userId: learnerId,
        now: new Date(),
        deleteAfter: new Date(),
      });
      expect(result).toBeNull();
    });
  });

  it("cancelDeletionRequest is idempotent — a repeat call returns null", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-01T00:00:00Z"),
      });

      const first = await cancelDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-02T00:00:00Z"),
      });
      expect(first?.cancelledAt).toEqual(new Date("2026-08-02T00:00:00Z"));

      const second = await cancelDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-03T00:00:00Z"),
      });
      expect(second).toBeNull();

      expect(await getActiveDeletionRequest(tx, learnerId)).toBeNull();
    });
  });

  it("cancelDeletionRequest cancels an already-confirmed (pending deletion) request too", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-01T00:00:00Z"),
      });
      await confirmDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-02T00:00:00Z"),
        deleteAfter: new Date("2026-08-09T00:00:00Z"),
      });

      const cancelled = await cancelDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-03T00:00:00Z"),
      });
      expect(cancelled?.cancelledAt).not.toBeNull();
    });
  });

  it("after a cancellation, a new deletion request can be started", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const firstRequest = await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-01T00:00:00Z"),
      });
      await cancelDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-02T00:00:00Z"),
      });

      const secondRequest = await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-03T00:00:00Z"),
      });
      expect(secondRequest.id).not.toBe(firstRequest.id);
    });
  });

  it("getDueDeletionRequests finds only confirmed, unexpired-window-passed, uncancelled/uncompleted requests", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId } = await seedTestFixtures(tx);
      const now = new Date("2026-08-10T00:00:00Z");

      // Due: confirmed well in the past.
      await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-01T00:00:00Z"),
      });
      const due = await confirmDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-08-01T00:00:00Z"),
        deleteAfter: new Date("2026-08-08T00:00:00Z"),
      });

      // Not due yet: confirmed, but deleteAfter is in the future.
      await createDeletionRequest(tx, {
        userId: developerId,
        now: new Date("2026-08-09T00:00:00Z"),
      });
      await confirmDeletionRequest(tx, {
        userId: developerId,
        now: new Date("2026-08-09T00:00:00Z"),
        deleteAfter: new Date("2026-08-16T00:00:00Z"),
      });

      const results = await getDueDeletionRequests(tx, now);
      expect(results.map((r) => r.id)).toEqual([due!.id]);
    });
  });

  it("getDueDeletionRequests excludes an unconfirmed request even if old", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-01-01T00:00:00Z"),
      });

      const results = await getDueDeletionRequests(
        tx,
        new Date("2026-08-10T00:00:00Z"),
      );
      expect(results).toEqual([]);
    });
  });

  it("getDueDeletionRequests excludes a cancelled or completed request", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId } = await seedTestFixtures(tx);
      const deleteAfter = new Date("2026-08-01T00:00:00Z");

      await createDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-07-01T00:00:00Z"),
      });
      await confirmDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-07-01T00:00:00Z"),
        deleteAfter,
      });
      await cancelDeletionRequest(tx, {
        userId: learnerId,
        now: new Date("2026-07-15T00:00:00Z"),
      });

      const completedRequest = await createDeletionRequest(tx, {
        userId: developerId,
        now: new Date("2026-07-01T00:00:00Z"),
      });
      await confirmDeletionRequest(tx, {
        userId: developerId,
        now: new Date("2026-07-01T00:00:00Z"),
        deleteAfter,
      });
      await markDeletionRequestCompleted(tx, {
        requestId: completedRequest.id,
        now: new Date("2026-08-01T00:00:00Z"),
      });

      expect(
        await getDueDeletionRequests(tx, new Date("2026-08-10T00:00:00Z")),
      ).toEqual([]);
    });
  });
});
