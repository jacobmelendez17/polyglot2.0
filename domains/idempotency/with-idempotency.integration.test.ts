import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DbClient } from "@/db/client";
import { idempotencyKeys, userNotes } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { createNote } from "@/domains/learner-content/repository";

import { cleanupExpiredIdempotencyKeys } from "./cleanup";
import { withIdempotency } from "./with-idempotency";

describe("withIdempotency", () => {
  it("a first call executes the operation and records a succeeded key", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId } = await seedTestFixtures(tx);
      const key = randomUUID();

      const result = await withIdempotency(
        tx,
        { userId: learnerId, operation: "test.note", key, payload: { learningItemId: casaId } },
        (innerTx) => createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "First call" }),
      );

      expect(result.body).toBe("First call");

      const [row] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      expect(row.status).toBe("succeeded");
      expect(row.userId).toBe(learnerId);
      expect(row.operation).toBe("test.note");
    });
  });

  it("a repeat call with the same key and payload replays the stored result without re-executing", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId } = await seedTestFixtures(tx);
      const key = randomUUID();
      let executions = 0;
      const fn = (innerTx: DbClient) => {
        executions += 1;
        return createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Replay body" });
      };
      const input = { userId: learnerId, operation: "test.note", key, payload: { learningItemId: casaId } };

      const first = await withIdempotency(tx, input, fn);
      const second = await withIdempotency(tx, input, fn);

      expect(executions).toBe(1);
      // A replay round-trips through jsonb, so Date fields come back as ISO
      // strings rather than Date instances — compare the JSON-stable shape,
      // not strict object identity. See with-idempotency.ts's docstring.
      expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(first)));

      const notes = await tx.select().from(userNotes).where(eq(userNotes.learningItemId, casaId));
      expect(notes).toHaveLength(1);
    });
  });

  it("rejects a repeat call with the same key but a different payload", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId, aguaId } = await seedTestFixtures(tx);
      const key = randomUUID();

      await withIdempotency(
        tx,
        { userId: learnerId, operation: "test.note", key, payload: { learningItemId: casaId } },
        (innerTx) => createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Original" }),
      );

      await expect(
        withIdempotency(
          tx,
          { userId: learnerId, operation: "test.note", key, payload: { learningItemId: aguaId } },
          (innerTx) => createNote(innerTx, { userId: learnerId, learningItemId: aguaId, body: "Different" }),
        ),
      ).rejects.toThrow(expect.objectContaining({ code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" }));
    });
  });

  it("rolls back both the effect and the key row when the operation fails", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId, gatoId } = await seedTestFixtures(tx);
      const key = randomUUID();

      // gatoId already has a note from seedTestFixtures — inserting a
      // second one inside fn forces a real failure after casa's note would
      // otherwise have been written.
      await expect(
        withIdempotency(tx, { userId: learnerId, operation: "test.note-fail", key, payload: {} }, async (innerTx) => {
          await createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Should not persist" });
          await createNote(innerTx, { userId: learnerId, learningItemId: gatoId, body: "Forces failure" });
        }),
      ).rejects.toThrow();

      const casaNotes = await tx.select().from(userNotes).where(eq(userNotes.learningItemId, casaId));
      expect(casaNotes).toHaveLength(0);

      const [keyRow] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      expect(keyRow).toBeUndefined();
    });
  });

  it("scopes keys per user — the same key from a different user is independent", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, casaId } = await seedTestFixtures(tx);
      const key = randomUUID();

      const learnerResult = await withIdempotency(
        tx,
        { userId: learnerId, operation: "test.note", key, payload: {} },
        (innerTx) => createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Learner note" }),
      );
      const developerResult = await withIdempotency(
        tx,
        { userId: developerId, operation: "test.note", key, payload: {} },
        (innerTx) => createNote(innerTx, { userId: developerId, learningItemId: casaId, body: "Developer note" }),
      );

      expect(learnerResult.body).toBe("Learner note");
      expect(developerResult.body).toBe("Developer note");
    });
  });

  it("scopes keys per operation — the same key for a different operation is independent", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId, aguaId } = await seedTestFixtures(tx);
      const key = randomUUID();

      const first = await withIdempotency(
        tx,
        { userId: learnerId, operation: "test.note-a", key, payload: {} },
        (innerTx) => createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Operation A" }),
      );
      const second = await withIdempotency(
        tx,
        { userId: learnerId, operation: "test.note-b", key, payload: {} },
        (innerTx) => createNote(innerTx, { userId: learnerId, learningItemId: aguaId, body: "Operation B" }),
      );

      expect(first.body).toBe("Operation A");
      expect(second.body).toBe("Operation B");
    });
  });

  it("stores exactly what fn returns in response_snapshot, never anything more — callers control what's retained", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId } = await seedTestFixtures(tx);
      const key = randomUUID();

      await withIdempotency(
        tx,
        { userId: learnerId, operation: "test.note-safe", key, payload: { learningItemId: casaId } },
        async (innerTx) => {
          await createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Sensitive learner content" });
          // A real consumer (e.g. a future spec 07 unit 6) is responsible
          // for returning a safe projection here — withIdempotency stores
          // it verbatim and never inspects or supplements it.
          return { noteCreated: true };
        },
      );

      const [row] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      expect(row.responseSnapshot).toEqual({ noteCreated: true });
      expect(JSON.stringify(row.responseSnapshot)).not.toContain("Sensitive learner content");
    });
  });

  it("removes expired keys via the cleanup function, leaving unexpired ones alone", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      const expiredKey = randomUUID();
      const freshKey = randomUUID();

      await tx.insert(idempotencyKeys).values({
        userId: learnerId,
        operation: "test.expired",
        key: expiredKey,
        requestHash: "hash",
        status: "succeeded",
        expiresAt: new Date(Date.now() - 1000),
      });
      await tx.insert(idempotencyKeys).values({
        userId: learnerId,
        operation: "test.fresh",
        key: freshKey,
        requestHash: "hash",
        status: "succeeded",
        expiresAt: new Date(Date.now() + 60_000),
      });

      const deletedCount = await cleanupExpiredIdempotencyKeys(tx);
      expect(deletedCount).toBe(1);

      const [expiredRow] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, expiredKey));
      const [freshRow] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, freshKey));
      expect(expiredRow).toBeUndefined();
      expect(freshRow).toBeDefined();
    });
  });
});

describe("withIdempotency concurrency (real, independently-committed transactions)", () => {
  it(
    "executes the operation exactly once under two concurrent calls with the same key",
    async () => {
      const { learnerId, casaId } = await seedTestFixtures(testDb);
      const key = randomUUID();
      let executions = 0;

      const slowFn = async (innerTx: DbClient) => {
        executions += 1;
        await new Promise((resolve) => setTimeout(resolve, 800));
        return createNote(innerTx, { userId: learnerId, learningItemId: casaId, body: "Concurrent" });
      };

      try {
        const results = await Promise.allSettled([
          withIdempotency(testDb, { userId: learnerId, operation: "test.concurrent-note", key, payload: {} }, slowFn, {
            lockTimeoutMs: 200,
          }),
          withIdempotency(testDb, { userId: learnerId, operation: "test.concurrent-note", key, payload: {} }, slowFn, {
            lockTimeoutMs: 200,
          }),
        ]);

        expect(executions).toBe(1);
        const succeeded = results.filter((result) => result.status === "fulfilled");
        const failed = results.filter((result) => result.status === "rejected");
        expect(succeeded).toHaveLength(1);
        expect(failed).toHaveLength(1);
        if (failed[0]?.status === "rejected") {
          expect(failed[0].reason).toEqual(expect.objectContaining({ code: "IDEMPOTENCY_OPERATION_IN_PROGRESS" }));
        }

        const notes = await testDb
          .select()
          .from(userNotes)
          .where(and(eq(userNotes.userId, learnerId), eq(userNotes.learningItemId, casaId)));
        expect(notes).toHaveLength(1);
      } finally {
        await testDb.delete(userNotes).where(and(eq(userNotes.userId, learnerId), eq(userNotes.learningItemId, casaId)));
        await testDb.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      }
    },
    15_000,
  );
});
