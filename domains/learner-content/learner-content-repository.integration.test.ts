import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { learningItems, userNotes, userSynonyms, users } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { normalizeForComparison } from "@/lib/answer-checking/normalize";

import { createNote, createSynonym, getNote, getSynonyms } from "./repository";

describe("learner-content repository", () => {
  it("returns the one note a user has for a learning item", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId } = await seedTestFixtures(tx);
      const note = await getNote(tx, learnerId, gatoId);
      expect(note?.body).toBe("Remember: el gato, not la gato.");
    });
  });

  it("rejects a second note for the same user/item pair", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId } = await seedTestFixtures(tx);
      await expect(createNote(tx, { userId: learnerId, learningItemId: gatoId, body: "A second note" })).rejects.toThrow();
    });
  });

  it("rejects duplicate synonyms for the same user, item, and side", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId } = await seedTestFixtures(tx);
      // seedTestFixtures already created a "meaning"-side synonym "kitty" for
      // (learnerId, gatoId) — a second identical one must be rejected.
      await expect(
        createSynonym(tx, { userId: learnerId, learningItemId: gatoId, side: "meaning", value: "Kitty" }),
      ).rejects.toThrow();
    });
  });

  it("allows the same normalized synonym on opposite sides to coexist", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId } = await seedTestFixtures(tx);
      const termSynonym = await createSynonym(tx, { userId: learnerId, learningItemId: gatoId, side: "term", value: "kitty" });
      expect(termSynonym.side).toBe("term");
      expect(termSynonym.normalizedValue).toBe(normalizeForComparison("kitty"));

      const synonyms = await getSynonyms(tx, learnerId, gatoId);
      expect(synonyms.map((s) => s.side).sort()).toEqual(["meaning", "term"]);
    });
  });

  it("cascades notes and synonyms when the owning user is deleted", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await tx.delete(users).where(eq(users.id, learnerId));

      const [noteRow] = await tx.select().from(userNotes).where(eq(userNotes.userId, learnerId));
      const [synonymRow] = await tx.select().from(userSynonyms).where(eq(userSynonyms.userId, learnerId));
      expect(noteRow).toBeUndefined();
      expect(synonymRow).toBeUndefined();
    });
  });

  it("rejects deleting a learning item that has notes or synonyms", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);
      await expect(tx.delete(learningItems).where(eq(learningItems.id, gatoId))).rejects.toThrow();
    });
  });

  it("never returns one user's notes or synonyms for another user", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId, gatoId } = await seedTestFixtures(tx);
      const developerNote = await getNote(tx, developerId, gatoId);
      const developerSynonyms = await getSynonyms(tx, developerId, gatoId);

      expect(developerNote).toBeNull();
      expect(developerSynonyms).toEqual([]);
    });
  });

  it("normalization is deterministic — the same input always produces the same normalized_value", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, casaId } = await seedTestFixtures(tx);
      const first = await createSynonym(tx, { userId: learnerId, learningItemId: casaId, side: "meaning", value: "  Home  " });
      expect(first.normalizedValue).toBe(normalizeForComparison("  Home  "));
      expect(first.normalizedValue).toBe(normalizeForComparison("home"));
    });
  });
});
