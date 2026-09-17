import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  createGrammarContentBlock,
  createItemResource,
  deleteGrammarContentBlock,
  deleteItemResource,
  reorderGrammarContentBlocks,
  reorderItemResources,
  updateGrammarContentBlock,
  updateItemResource,
} from "./curriculum-mutation-repository";
import {
  getGrammarContentBlocks,
  getItemResources,
} from "./curriculum-repository";

/**
 * Spec 18's authoring mutations, against the real schema. Two of the
 * behaviors under test are the database's rather than this code's — the
 * block shape check, and the `(item, position)` unique constraint a reorder
 * would violate if it renumbered naively — so a mocked test would prove
 * nothing about either.
 */
describe("grammar content block mutations", () => {
  it("appends each new block after the last", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);

      await createGrammarContentBlock(tx, grammarYId, {
        type: "text",
        body: "First.",
      });
      await createGrammarContentBlock(tx, grammarYId, {
        type: "note",
        body: "Second.",
      });

      const blocks = await getGrammarContentBlocks(tx, grammarYId);
      expect(blocks.map((block) => block.position)).toEqual([1, 2]);
      expect(blocks.map((block) => block.type)).toEqual(["text", "note"]);
    });
  });

  it("clears the previous type's columns when a block changes type", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      const blockId = await createGrammarContentBlock(tx, grammarYId, {
        type: "example",
        targetText: "pan y agua",
        translation: "bread and water",
      });

      // The check constraint rejects a row carrying both shapes, so this
      // passing is itself the assertion that nothing was merged.
      await updateGrammarContentBlock(tx, blockId, {
        type: "text",
        body: "Joins two nouns.",
      });

      const [block] = await getGrammarContentBlocks(tx, grammarYId);
      expect(block).toMatchObject({ type: "text", body: "Joins two nouns." });
    });
  });

  it("reorders without ever violating the position constraint", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      const first = await createGrammarContentBlock(tx, grammarYId, {
        type: "text",
        body: "First.",
      });
      const second = await createGrammarContentBlock(tx, grammarYId, {
        type: "text",
        body: "Second.",
      });
      const third = await createGrammarContentBlock(tx, grammarYId, {
        type: "text",
        body: "Third.",
      });

      // A straight swap would transiently put two blocks at the same
      // position; the two-pass negative-then-positive write is what avoids it.
      await reorderGrammarContentBlocks(tx, grammarYId, [third, first, second]);

      expect(
        (await getGrammarContentBlocks(tx, grammarYId)).map(
          (block) => block.id,
        ),
      ).toEqual([third, first, second]);
    });
  });

  it("leaves the remaining blocks readable after a delete", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      const first = await createGrammarContentBlock(tx, grammarYId, {
        type: "text",
        body: "First.",
      });
      await createGrammarContentBlock(tx, grammarYId, {
        type: "text",
        body: "Second.",
      });

      await deleteGrammarContentBlock(tx, first);

      const blocks = await getGrammarContentBlocks(tx, grammarYId);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ body: "Second." });
    });
  });
});

describe("item resource mutations", () => {
  it("appends, updates, reorders, and deletes", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);

      const first = await createItemResource(tx, gatoId, {
        label: "First",
        url: "https://example.invalid/a",
      });
      const second = await createItemResource(tx, gatoId, {
        label: "Second",
        url: "https://example.invalid/b",
      });
      expect(
        (await getItemResources(tx, gatoId)).map((resource) => resource.label),
      ).toEqual(["First", "Second"]);

      await updateItemResource(tx, first, { label: "Renamed" });
      expect((await getItemResources(tx, gatoId))[0]).toMatchObject({
        label: "Renamed",
        url: "https://example.invalid/a",
      });

      await reorderItemResources(tx, gatoId, [second, first]);
      expect(
        (await getItemResources(tx, gatoId)).map((resource) => resource.id),
      ).toEqual([second, first]);

      await deleteItemResource(tx, second);
      expect(await getItemResources(tx, gatoId)).toHaveLength(1);
    });
  });

  it("updates only the field it is given", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);
      const id = await createItemResource(tx, gatoId, {
        label: "Label",
        url: "https://example.invalid/a",
      });

      await updateItemResource(tx, id, { url: "https://example.invalid/b" });

      expect((await getItemResources(tx, gatoId))[0]).toMatchObject({
        label: "Label",
        url: "https://example.invalid/b",
      });
    });
  });
});
