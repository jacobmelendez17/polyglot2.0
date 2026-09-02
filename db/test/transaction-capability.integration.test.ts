import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { userNotes } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { createNote } from "@/domains/learner-content/repository";

import { withTestTransaction } from "./with-test-transaction";

/**
 * Spec 08 §60 — establishes that the selected Neon/Drizzle adapter
 * (`drizzle-orm/neon-serverless`, spec §3) genuinely supports interactive,
 * multi-write transactions, the capability every future lesson/review
 * mutation and §53's idempotency helper depend on. Uses `createNote` — a
 * small, already-existing database-foundation write — as the fixture
 * operation, per the spec's explicit instruction not to invent fake
 * lesson/review behavior just to test this. `domains/idempotency`'s own
 * integration tests reuse this same fixture operation.
 */
describe("transaction capability (spec 08 §60)", () => {
  it("commits every write in a multi-write transaction when it succeeds", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId, aguaId } = await seedTestFixtures(tx);

      await tx.transaction(async (inner) => {
        await createNote(inner, { userId: learnerId, learningItemId: casaId, body: "Note 1" });
        await createNote(inner, { userId: learnerId, learningItemId: aguaId, body: "Note 2" });
      });

      const notes = await tx.select().from(userNotes).where(eq(userNotes.userId, learnerId));
      const bodies = notes.map((note) => note.body);
      expect(bodies).toContain("Note 1");
      expect(bodies).toContain("Note 2");
    });
  });

  it("rolls back every write in a multi-write transaction when one statement fails", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId, gatoId } = await seedTestFixtures(tx);
      // seedTestFixtures already created a note for (learnerId, gatoId) — a
      // second insert for that same pair violates the unique constraint,
      // forcing the whole nested transaction to fail after casa's note (the
      // first statement) would otherwise have succeeded.
      await expect(
        tx.transaction(async (inner) => {
          await createNote(inner, { userId: learnerId, learningItemId: casaId, body: "Should not persist" });
          await createNote(inner, { userId: learnerId, learningItemId: gatoId, body: "Forces failure" });
        }),
      ).rejects.toThrow();

      const casaNotes = await tx.select().from(userNotes).where(eq(userNotes.learningItemId, casaId));
      expect(casaNotes).toHaveLength(0);
    });
  });
});
