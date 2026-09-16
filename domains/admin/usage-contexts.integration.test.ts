import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, ITEM_GATO_ID, ITEM_Y_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getItemExamples, getUsageContexts } from "@/domains/curriculum/curriculum-mutation-repository";

import { mutateItemExample, mutateUsageContext } from "./publication-service";

/** Spec 17 — usage contexts (the tabs a word's examples are grouped under) and the examples themselves. */
describe("usage contexts", () => {
  const key = () => crypto.randomUUID();

  it("adds tabs in the order they were created", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      for (const label of ["como", "comes"]) {
        await mutateUsageContext(tx, {
          learningItemId: ITEM_GATO_ID,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: key(),
          mutation: { kind: "create", learningItemId: ITEM_GATO_ID, label },
        });
      }

      const contexts = await getUsageContexts(tx, ITEM_GATO_ID);
      expect(contexts.map((context) => context.label)).toEqual(["como", "comes"]);
      expect(contexts.map((context) => context.position)).toEqual([1, 2]);
    });
  });

  it("renames and reorders them", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const ids: string[] = [];
      for (const label of ["first", "second"]) {
        const { usageContextId } = await mutateUsageContext(tx, {
          learningItemId: ITEM_GATO_ID,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: key(),
          mutation: { kind: "create", learningItemId: ITEM_GATO_ID, label },
        });
        ids.push(usageContextId!);
      }

      await mutateUsageContext(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "update", usageContextId: ids[0]!, label: "renamed", note: "a note" },
      });
      await mutateUsageContext(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "reorder", learningItemId: ITEM_GATO_ID, orderedIds: [ids[1]!, ids[0]!] },
      });

      const contexts = await getUsageContexts(tx, ITEM_GATO_ID);
      expect(contexts.map((context) => context.label)).toEqual(["second", "renamed"]);
      expect(contexts[1]!.note).toBe("a note");
    });
  });

  it("returns a deleted tab's examples to General instead of destroying them", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const { usageContextId } = await mutateUsageContext(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", learningItemId: ITEM_GATO_ID, label: "como" },
      });
      await mutateItemExample(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", targetText: "Yo como pan.", translation: "I eat bread.", usageContextId },
      });

      await mutateUsageContext(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "delete", usageContextId: usageContextId! },
      });

      // Losing a tab must not silently lose the sentences written in it.
      const examples = await getItemExamples(tx, ITEM_GATO_ID);
      const written = examples.find((example) => example.targetText === "Yo como pan.");
      expect(written).toBeDefined();
      expect(written!.usageContextId).toBeNull();
    });
  });

  it("creates a usage context on a grammar item (spec 18 widened usage contexts beyond vocabulary)", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const { usageContextId } = await mutateUsageContext(tx, {
        learningItemId: ITEM_Y_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", learningItemId: ITEM_Y_ID, label: "conjunctions" },
      });

      const contexts = await getUsageContexts(tx, ITEM_Y_ID);
      expect(contexts.map((context) => context.label)).toEqual(["conjunctions"]);
      expect(usageContextId).toBeTruthy();
    });
  });
});

describe("item examples", () => {
  const key = () => crypto.randomUUID();

  it("creates an example the application previously had no way to author", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const before = await getItemExamples(tx, ITEM_GATO_ID);

      await mutateItemExample(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", targetText: "El gato come.", translation: "The cat eats." },
      });

      const after = await getItemExamples(tx, ITEM_GATO_ID);
      expect(after).toHaveLength(before.length + 1);
      expect(after.at(-1)).toMatchObject({ targetText: "El gato come.", translation: "The cat eats.", usageContextId: null });
    });
  });

  it("edits an example's text and moves it between tabs", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const { usageContextId } = await mutateUsageContext(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", learningItemId: ITEM_GATO_ID, label: "como" },
      });
      const { exampleId } = await mutateItemExample(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", targetText: "typo", translation: "typo" },
      });

      await mutateItemExample(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "update", exampleId: exampleId!, targetText: "Yo como pan.", translation: "I eat bread.", usageContextId },
      });

      const example = (await getItemExamples(tx, ITEM_GATO_ID)).find((row) => row.id === exampleId);
      expect(example).toMatchObject({ targetText: "Yo como pan.", translation: "I eat bread.", usageContextId });
    });
  });

  it("deletes an example, and the sentence with it", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const { exampleId } = await mutateItemExample(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", targetText: "Se borra.", translation: "It gets deleted." },
      });

      await mutateItemExample(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "delete", exampleId: exampleId! },
      });

      expect((await getItemExamples(tx, ITEM_GATO_ID)).some((row) => row.id === exampleId)).toBe(false);
    });
  });

  it("allows examples on a grammar item, which had no authoring surface at all before", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      await mutateItemExample(tx, {
        learningItemId: ITEM_Y_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: key(),
        mutation: { kind: "create", targetText: "pan y agua", translation: "bread and water" },
      });

      expect((await getItemExamples(tx, ITEM_Y_ID)).some((row) => row.targetText === "pan y agua")).toBe(true);
    });
  });
});
