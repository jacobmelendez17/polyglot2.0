import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { grammarContentBlocks, learningItemResources, learningItems } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getGrammarContentBlocks, getItemResources, getSiblingItemIds } from "./curriculum-repository";

/**
 * Spec 18's three new curriculum reads. Exercised against the real schema
 * rather than a mock, because two of the three behaviors under test — the
 * content-block check constraint and published-only sibling filtering — are
 * enforced by the database, not by this code.
 */
describe("grammar content blocks", () => {
  it("returns blocks in authored order regardless of insertion order", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);

      await tx.insert(grammarContentBlocks).values([
        { learningItemId: grammarYId, type: "note", position: 2, body: "Watch the accent." },
        { learningItemId: grammarYId, type: "text", position: 1, body: "Joins two things." },
        { learningItemId: grammarYId, type: "example", position: 3, targetText: "pan y agua", translation: "bread and water" },
      ]);

      const blocks = await getGrammarContentBlocks(tx, grammarYId);

      expect(blocks.map((block) => block.position)).toEqual([1, 2, 3]);
      expect(blocks[0]).toMatchObject({ type: "text", body: "Joins two things." });
      expect(blocks[2]).toMatchObject({ type: "example", targetText: "pan y agua", translation: "bread and water" });
    });
  });

  it("refuses a block whose shape does not match its type", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);

      // An example with no translation, and a note with no body: both are
      // rejected by `grammar_content_blocks_shape_check`, so a half-filled
      // block can never reach a learner even if a caller skips validation.
      await expect(
        tx.insert(grammarContentBlocks).values({ learningItemId: grammarYId, type: "example", position: 1, targetText: "pan y agua" }),
      ).rejects.toThrow();

      await expect(
        tx.insert(grammarContentBlocks).values({ learningItemId: grammarYId, type: "note", position: 1 }),
      ).rejects.toThrow();
    });
  });

  it("returns an empty list for an item with no blocks authored yet", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      expect(await getGrammarContentBlocks(tx, grammarYId)).toEqual([]);
    });
  });
});

describe("item resources", () => {
  it("returns resources in display order", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);

      await tx.insert(learningItemResources).values([
        { learningItemId: gatoId, label: "Second", url: "https://example.invalid/b", position: 2 },
        { learningItemId: gatoId, label: "First", url: "https://example.invalid/a", position: 1 },
      ]);

      expect((await getItemResources(tx, gatoId)).map((resource) => resource.label)).toEqual(["First", "Second"]);
    });
  });

  it("rejects two resources at the same position on one item", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);

      await tx.insert(learningItemResources).values({ learningItemId: gatoId, label: "A", url: "https://example.invalid/a", position: 1 });
      await expect(
        tx.insert(learningItemResources).values({ learningItemId: gatoId, label: "B", url: "https://example.invalid/b", position: 1 }),
      ).rejects.toThrow();
    });
  });
});

describe("hero navigation siblings", () => {
  it("cycles vocabulary through its own theme, in curriculum order", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, casaId, aguaId, rojoId, level1Id, vocabGroupId } = await seedTestFixtures(tx);

      const ids = await getSiblingItemIds(tx, { id: gatoId, type: "vocabulary", levelId: level1Id }, vocabGroupId);

      expect(ids).toContain(gatoId);
      expect(ids).toContain(casaId);
      expect(ids).toContain(aguaId);
      // A word in another theme is not part of this word's navigation.
      expect(ids).not.toContain(rojoId);
    });
  });

  it("cycles grammar through every grammar item in the level, in position order", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, level1Id, languageId } = await seedTestFixtures(tx);

      // Grammar items created here rather than reusing the seeded `y`: that
      // fixture row has drifted out of the fixture level in the shared
      // database (see progress-tracker.md's Next Up A), and a navigation
      // test should not depend on where a row happens to have been moved.
      // High positions avoid colliding with anything already in the level.
      const [second] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "grammar", status: "published", position: 902, lessonPriority: 902 })
        .returning({ id: learningItems.id });
      const [first] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "grammar", status: "published", position: 901, lessonPriority: 901 })
        .returning({ id: learningItems.id });

      const ids = await getSiblingItemIds(tx, { id: first.id, type: "grammar", levelId: level1Id }, null);

      expect(ids.filter((id) => id === first.id || id === second.id)).toEqual([first.id, second.id]);
      // Vocabulary is never part of a grammar item's navigation.
      expect(ids).not.toContain(gatoId);
    });
  });

  it("never puts an unpublished sibling in a learner's navigation", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, casaId, level1Id, vocabGroupId } = await seedTestFixtures(tx);

      await tx.update(learningItems).set({ status: "archived" }).where(eq(learningItems.id, casaId));

      const ids = await getSiblingItemIds(tx, { id: gatoId, type: "vocabulary", levelId: level1Id }, vocabGroupId);

      expect(ids).toContain(gatoId);
      expect(ids).not.toContain(casaId);
    });
  });

  it("returns nothing for a vocabulary item with no theme", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, level1Id } = await seedTestFixtures(tx);
      expect(await getSiblingItemIds(tx, { id: gatoId, type: "vocabulary", levelId: level1Id }, null)).toEqual([]);
    });
  });
});
