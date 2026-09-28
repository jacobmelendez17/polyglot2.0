import { describe, expect, it } from "vitest";

import {
  DEVELOPER_ID,
  ITEM_AGUA_ID,
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  ITEM_Y_ID,
  LEVEL_2_ID,
  VOCAB_GROUP_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  getDraft,
  lockLearningItemForEdit,
} from "@/domains/curriculum/curriculum-mutation-repository";

import { getAuditEvents } from "./audit-repository";
import {
  archiveItem,
  bulkArchiveItems,
  bulkMoveItems,
  bulkPublishDraftedItems,
  bulkPublishPendingItems,
  createItem,
  updateItem,
} from "./publication-service";

function vocabFields(term: string, meaning: string) {
  return {
    vocabularyGroupId: VOCAB_GROUP_ID,
    term,
    primaryMeaning: meaning,
    article: "el",
    partOfSpeech: "noun",
    acceptedAnswers: [],
  };
}

describe("bulkArchiveItems", () => {
  it("archives every selected item and records one CURRICULUM_ITEM_ARCHIVED per item, sharing a correlationId", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      await bulkArchiveItems(tx, {
        learningItemIds: [ITEM_CASA_ID, ITEM_AGUA_ID],
        actorUserId: DEVELOPER_ID,
        reason: "Retiring these",
        idempotencyKey,
      });

      expect((await lockLearningItemForEdit(tx, ITEM_CASA_ID))?.status).toBe(
        "archived",
      );
      expect((await lockLearningItemForEdit(tx, ITEM_AGUA_ID))?.status).toBe(
        "archived",
      );

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_ARCHIVED",
        limit: 10,
      });
      const forThisBatch = audit.items.filter(
        (e) => e.correlationId === idempotencyKey,
      );
      expect(forThisBatch).toHaveLength(2);
      expect(forThisBatch.every((e) => e.reason === "Retiring these")).toBe(
        true,
      );
    });
  });

  it("rolls back the whole batch when one item doesn't exist", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const attempt = bulkArchiveItems(tx, {
        learningItemIds: [ITEM_CASA_ID, "00000000-0000-0000-0000-000000000000"],
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(attempt).rejects.toMatchObject({
        code: "CURRICULUM_ITEM_NOT_FOUND",
      });
      // The real item earlier in the array must not have been archived either — all or nothing.
      expect((await lockLearningItemForEdit(tx, ITEM_CASA_ID))?.status).toBe(
        "published",
      );
    });
  });
});

describe("bulkMoveItems", () => {
  it("moves every selected item to a new level, silently skipping a grammar item's group assignment", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      await bulkMoveItems(tx, {
        learningItemIds: [ITEM_CASA_ID, ITEM_Y_ID],
        levelId: LEVEL_2_ID,
        vocabularyGroupId: VOCAB_GROUP_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
      });

      expect((await lockLearningItemForEdit(tx, ITEM_CASA_ID))?.levelId).toBe(
        LEVEL_2_ID,
      );
      expect((await lockLearningItemForEdit(tx, ITEM_Y_ID))?.levelId).toBe(
        LEVEL_2_ID,
      );

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_MOVED",
        limit: 10,
      });
      const forThisBatch = audit.items.filter(
        (e) => e.correlationId === idempotencyKey,
      );
      expect(forThisBatch).toHaveLength(2);
    });
  });
});

describe("bulkPublishPendingItems", () => {
  it("publishes every selected pending item transactionally", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const first = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("perro", "dog"),
      });
      const second = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("nube", "cloud"),
      });

      await bulkPublishPendingItems(tx, {
        learningItemIds: [first.learningItemId, second.learningItemId],
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(
        (await lockLearningItemForEdit(tx, first.learningItemId))?.status,
      ).toBe("published");
      expect(
        (await lockLearningItemForEdit(tx, second.learningItemId))?.status,
      ).toBe("published");
    });
  });

  it("rejects the whole batch, publishing nothing, if any selected item isn't actually Pending", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const pending = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("silla", "chair"),
      });

      // ITEM_GATO_ID is already published in the fixture — mixing it into the batch must fail the whole thing.
      const attempt = bulkPublishPendingItems(tx, {
        learningItemIds: [pending.learningItemId, ITEM_GATO_ID],
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(attempt).rejects.toMatchObject({
        code: "CURRICULUM_VALIDATION_FAILED",
      });
      // The item that legitimately was Pending must still be Pending — nothing published.
      expect(
        (await lockLearningItemForEdit(tx, pending.learningItemId))?.status,
      ).toBe("pending");
    });
  });
});

describe("bulkPublishDraftedItems (spec 25 §14.3)", () => {
  it("publishes every selected item's draft, skipping — not failing — an item with nothing to publish", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      // ITEM_GATO_ID is published in the fixture — draft a change onto it.
      await updateItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("gato", "cat (imported update)"),
      });
      // ITEM_CASA_ID is published too, but has no draft — the case a plain
      // "update" or "move" row leaves behind (spec's own example: only
      // *some* updated items end up drafted).
      expect(await getDraft(tx, ITEM_CASA_ID)).toBeNull();

      const result = await bulkPublishDraftedItems(tx, {
        learningItemIds: [ITEM_GATO_ID, ITEM_CASA_ID],
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
        correlationId: "import-1",
      });

      expect(result).toEqual({
        publishedItemIds: [ITEM_GATO_ID],
        skippedItemIds: [ITEM_CASA_ID],
      });
      expect(await getDraft(tx, ITEM_GATO_ID)).toBeNull();

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_PUBLISHED",
        resourceId: ITEM_GATO_ID,
        limit: 10,
      });
      expect(audit.items.some((e) => e.correlationId === "import-1")).toBe(
        true,
      );
    });
  });

  it("skips a pending item (never published, so never drafted) and an archived one, without failing the batch", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const pending = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("silla", "chair"),
      });
      await archiveItem(tx, {
        learningItemId: ITEM_AGUA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const result = await bulkPublishDraftedItems(tx, {
        learningItemIds: [pending.learningItemId, ITEM_AGUA_ID],
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        correlationId: "import-2",
      });

      expect(result.publishedItemIds).toEqual([]);
      expect(result.skippedItemIds).toEqual([
        pending.learningItemId,
        ITEM_AGUA_ID,
      ]);
      // Neither status changed — a skip is a no-op, not a silent side effect.
      expect(
        (await lockLearningItemForEdit(tx, pending.learningItemId))?.status,
      ).toBe("pending");
      expect((await lockLearningItemForEdit(tx, ITEM_AGUA_ID))?.status).toBe(
        "archived",
      );
    });
  });
});
