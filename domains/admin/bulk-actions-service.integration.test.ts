import { randomUUID } from "node:crypto";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  DEVELOPER_ID,
  ITEM_AGUA_ID,
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  ITEM_ROJO_ID,
  ITEM_Y_ID,
  LEVEL_2_ID,
  VOCAB_GROUP_2_ID,
  VOCAB_GROUP_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import {
  adminAuditEvents,
  grammarItems,
  languages,
  learningItems,
  levels,
  users,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { testDb } from "@/db/test/test-client";
import {
  withTestTransaction,
  type TestTx,
} from "@/db/test/with-test-transaction";
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
  moveItem,
  publishItem,
  reorderItems,
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

/** A pending vocabulary item in `levelId`, made by the real service. */
async function pendingItem(
  tx: TestTx,
  languageId: string,
  levelId: string,
  term: string,
) {
  return (
    await createItem(tx, {
      languageId,
      levelId,
      actorUserId: DEVELOPER_ID,
      idempotencyKey: randomUUID(),
      type: "vocabulary",
      fields: vocabFields(term, `meaning of ${term}`),
    })
  ).learningItemId;
}

/** Where an item is in the order — read straight from the table, apart from the code under test. */
async function placeOf(tx: TestTx, itemId: string) {
  const [row] = await tx
    .select({
      levelId: learningItems.levelId,
      status: learningItems.status,
      position: learningItems.position,
      lessonPriority: learningItems.lessonPriority,
    })
    .from(learningItems)
    .where(eq(learningItems.id, itemId));
  return row!;
}

async function groupOfItem(tx: TestTx, itemId: string) {
  const [vocab] = await tx
    .select({ groupId: vocabularyItems.vocabularyGroupId })
    .from(vocabularyItems)
    .where(eq(vocabularyItems.learningItemId, itemId));
  if (vocab) return vocab.groupId;
  const [grammar] = await tx
    .select({ groupId: grammarItems.vocabularyGroupId })
    .from(grammarItems)
    .where(eq(grammarItems.learningItemId, itemId));
  return grammar?.groupId ?? null;
}

async function auditCount(tx: TestTx, action: string, resourceId: string) {
  const audit = await getAuditEvents(tx, {
    action: action as "CURRICULUM_ITEM_MOVED",
    resourceId,
    limit: 50,
  });
  return audit.items.length;
}

/** Another language, with a level, a group and an item of its own — for proving nothing crosses over. */
async function seedOtherLanguage(tx: TestTx) {
  const unique = randomUUID().slice(0, 8);
  const [language] = await tx
    .insert(languages)
    .values({
      code: `t-${unique}`,
      slug: `t-${unique}`,
      name: `Other ${unique}`,
    })
    .returning({ id: languages.id });
  const [level] = await tx
    .insert(levels)
    .values({
      languageId: language!.id,
      levelNumber: 1,
      name: "Other level",
      status: "published",
    })
    .returning({ id: levels.id });
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({
      languageId: language!.id,
      levelId: level!.id,
      name: "Other group",
      position: 1,
      status: "published",
    })
    .returning({ id: vocabularyGroups.id });
  const itemId = randomUUID();
  await tx.insert(learningItems).values({
    id: itemId,
    languageId: language!.id,
    levelId: level!.id,
    type: "vocabulary",
    status: "published",
    position: 1,
    lessonPriority: 1,
  });
  await tx.insert(vocabularyItems).values({
    learningItemId: itemId,
    vocabularyGroupId: group!.id,
    term: "otro",
    primaryMeaning: "other",
    partOfSpeech: "noun",
  });
  return {
    languageId: language!.id,
    levelId: level!.id,
    groupId: group!.id,
    itemId,
  };
}

const BASE = { actorUserId: DEVELOPER_ID };

describe("bulkArchiveItems", () => {
  it("archives every selected item and records one CURRICULUM_ITEM_ARCHIVED per item, sharing a correlationId", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = randomUUID();

      const result = await bulkArchiveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID, ITEM_AGUA_ID],
        reason: "Retiring these",
        idempotencyKey,
      });

      expect(result).toEqual({
        archivedItemIds: [ITEM_CASA_ID, ITEM_AGUA_ID],
        alreadyArchivedItemIds: [],
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

  it("rolls back the whole batch when one item doesn't exist — and says so in words", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const attempt = bulkArchiveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID, "00000000-0000-0000-0000-000000000000"],
        idempotencyKey: randomUUID(),
      });

      await expect(attempt).rejects.toMatchObject({
        code: "CURRICULUM_ITEM_NOT_FOUND",
        message:
          "One of the selected items no longer exists. Reload the list and try again.",
      });
      // The real item earlier in the array must not have been archived either — all or nothing.
      expect((await lockLearningItemForEdit(tx, ITEM_CASA_ID))?.status).toBe(
        "published",
      );
    });
  });

  it("leaves an item that is already archived exactly as it was — no second audit event — and says so", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await archiveItem(tx, {
        learningItemId: ITEM_AGUA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
      });
      const before = await auditCount(
        tx,
        "CURRICULUM_ITEM_ARCHIVED",
        ITEM_AGUA_ID,
      );

      const result = await bulkArchiveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_AGUA_ID, ITEM_CASA_ID],
        idempotencyKey: randomUUID(),
      });

      expect(result).toEqual({
        archivedItemIds: [ITEM_CASA_ID],
        alreadyArchivedItemIds: [ITEM_AGUA_ID],
      });
      expect(
        await auditCount(tx, "CURRICULUM_ITEM_ARCHIVED", ITEM_AGUA_ID),
      ).toBe(before);
      expect(
        await auditCount(tx, "CURRICULUM_ITEM_ARCHIVED", ITEM_CASA_ID),
      ).toBe(1);
    });
  });

  it("discards an open, unpublished edit along with archiving the item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await updateItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
        type: "vocabulary",
        fields: vocabFields("gato", "cat (edited)"),
      });
      expect(await getDraft(tx, ITEM_GATO_ID)).not.toBeNull();

      await bulkArchiveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_GATO_ID],
        idempotencyKey: randomUUID(),
      });

      expect(await getDraft(tx, ITEM_GATO_ID)).toBeNull();
      expect((await placeOf(tx, ITEM_GATO_ID)).status).toBe("archived");
    });
  });

  it("refuses the whole batch when an item belongs to another language, archiving nothing", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const other = await seedOtherLanguage(tx);

      const attempt = bulkArchiveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID, other.itemId],
        idempotencyKey: randomUUID(),
      });

      await expect(attempt).rejects.toMatchObject({
        code: "CURRICULUM_VALIDATION_FAILED",
        message:
          "Some of the selected items aren't in this language. Reload the list and try again.",
      });
      expect((await placeOf(tx, ITEM_CASA_ID)).status).toBe("published");
      expect((await placeOf(tx, other.itemId)).status).toBe("published");
    });
  });

  it("answers a repeat of the same request from the stored result, and refuses the same key for a different one", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = randomUUID();
      const request = {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID],
        idempotencyKey,
      };

      const first = await bulkArchiveItems(tx, request);
      const again = await bulkArchiveItems(tx, request);

      expect(again).toEqual(first);
      // One archive, one audit event — not two.
      expect(
        await auditCount(tx, "CURRICULUM_ITEM_ARCHIVED", ITEM_CASA_ID),
      ).toBe(1);
      await expect(
        bulkArchiveItems(tx, { ...request, learningItemIds: [ITEM_AGUA_ID] }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" });
      // The language the command acts in is part of what the key stands for.
      await expect(
        bulkArchiveItems(tx, { ...request, languageId: randomUUID() }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" });
    });
  });
});

describe("bulkMoveItems", () => {
  it("moves items to a new level in the order they are named — at the end of it, with position and lesson priority in step", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = randomUUID();
      // Level 2 already holds rojo at position 1.
      expect(await placeOf(tx, ITEM_ROJO_ID)).toMatchObject({
        position: 1,
        lessonPriority: 1,
      });

      const result = await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_AGUA_ID, ITEM_CASA_ID],
        levelId: LEVEL_2_ID,
        idempotencyKey,
      });

      expect(result).toEqual({
        movedItemIds: [ITEM_AGUA_ID, ITEM_CASA_ID],
        unchangedItemIds: [],
      });
      // agua was named first, so it lands first; each item's two numbers agree.
      expect(await placeOf(tx, ITEM_AGUA_ID)).toMatchObject({
        levelId: LEVEL_2_ID,
        position: 2,
        lessonPriority: 2,
      });
      expect(await placeOf(tx, ITEM_CASA_ID)).toMatchObject({
        levelId: LEVEL_2_ID,
        position: 3,
        lessonPriority: 3,
      });

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_MOVED",
        limit: 10,
      });
      expect(
        audit.items.filter((e) => e.correlationId === idempotencyKey),
      ).toHaveLength(2);
    });
  });

  it("gives a moved item the end of its new level even when its old lesson priority was something else", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      // An item whose two numbers had drifted apart before it was moved.
      await tx
        .update(learningItems)
        .set({ lessonPriority: 40 })
        .where(eq(learningItems.id, ITEM_CASA_ID));

      await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID],
        levelId: LEVEL_2_ID,
        idempotencyKey: randomUUID(),
      });

      const moved = await placeOf(tx, ITEM_CASA_ID);
      expect(moved.lessonPriority).toBe(moved.position);
    });
  });

  it("leaves a grammar item ungrouped when it is moved to another level on its own — a group belongs to one level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await tx
        .update(grammarItems)
        .set({ vocabularyGroupId: VOCAB_GROUP_ID })
        .where(eq(grammarItems.learningItemId, ITEM_Y_ID));

      await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_Y_ID],
        levelId: LEVEL_2_ID,
        idempotencyKey: randomUUID(),
      });

      expect((await placeOf(tx, ITEM_Y_ID)).levelId).toBe(LEVEL_2_ID);
      expect(await groupOfItem(tx, ITEM_Y_ID)).toBeNull();
    });
  });

  it("files vocabulary and grammar items under a group, and leaves their level alone", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const result = await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_AGUA_ID, ITEM_Y_ID],
        vocabularyGroupId: VOCAB_GROUP_2_ID,
        idempotencyKey: randomUUID(),
      });

      expect(result.movedItemIds).toEqual([ITEM_AGUA_ID, ITEM_Y_ID]);
      expect(await groupOfItem(tx, ITEM_AGUA_ID)).toBe(VOCAB_GROUP_2_ID);
      expect(await groupOfItem(tx, ITEM_Y_ID)).toBe(VOCAB_GROUP_2_ID);
      expect((await placeOf(tx, ITEM_AGUA_ID)).levelId).toBe(level1Id);
      // Where it sat in the order is unchanged: a group move is not a reorder.
      expect((await placeOf(tx, ITEM_AGUA_ID)).position).toBe(3);
    });
  });

  it("leaves an item already in the target level, or group, alone — no write, no audit event, no reshuffle", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const before = await placeOf(tx, ITEM_GATO_ID);

      // gato is already in Level 1 and already in VOCAB_GROUP_ID.
      const toLevel = await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_GATO_ID],
        levelId: level1Id,
        idempotencyKey: randomUUID(),
      });
      const toGroup = await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_GATO_ID],
        vocabularyGroupId: VOCAB_GROUP_ID,
        idempotencyKey: randomUUID(),
      });

      for (const result of [toLevel, toGroup]) {
        expect(result).toEqual({
          movedItemIds: [],
          unchangedItemIds: [ITEM_GATO_ID],
        });
      }
      expect(await placeOf(tx, ITEM_GATO_ID)).toEqual(before);
      expect(await auditCount(tx, "CURRICULUM_ITEM_MOVED", ITEM_GATO_ID)).toBe(
        0,
      );
    });
  });

  it("applies a level and a group together, skipping only the half an item already satisfies", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      // casa is already in Level 1, but not in VOCAB_GROUP_2_ID: only the group changes.
      const result = await bulkMoveItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID],
        levelId: level1Id,
        vocabularyGroupId: VOCAB_GROUP_2_ID,
        idempotencyKey: randomUUID(),
      });

      expect(result.movedItemIds).toEqual([ITEM_CASA_ID]);
      expect(await groupOfItem(tx, ITEM_CASA_ID)).toBe(VOCAB_GROUP_2_ID);
      expect(await placeOf(tx, ITEM_CASA_ID)).toMatchObject({
        levelId: level1Id,
        position: 2,
      });
    });
  });

  it("refuses a level, or a group, that belongs to another language — or does not exist — moving nothing", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const other = await seedOtherLanguage(tx);
      const before = await placeOf(tx, ITEM_CASA_ID);
      const group = await groupOfItem(tx, ITEM_CASA_ID);

      const attempts = [
        { levelId: other.levelId },
        { vocabularyGroupId: other.groupId },
        { levelId: randomUUID() },
        { vocabularyGroupId: randomUUID() },
      ];
      for (const target of attempts) {
        await expect(
          bulkMoveItems(tx, {
            ...BASE,
            languageId,
            learningItemIds: [ITEM_CASA_ID],
            ...target,
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
      }
      expect(await placeOf(tx, ITEM_CASA_ID)).toEqual(before);
      expect(await groupOfItem(tx, ITEM_CASA_ID)).toBe(group);
    });
  });

  it("refuses a batch that names an item of another language, moving nothing", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const other = await seedOtherLanguage(tx);

      await expect(
        bulkMoveItems(tx, {
          ...BASE,
          languageId,
          learningItemIds: [ITEM_CASA_ID, other.itemId],
          levelId: LEVEL_2_ID,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
      expect((await placeOf(tx, ITEM_CASA_ID)).levelId).not.toBe(LEVEL_2_ID);
    });
  });

  it("rolls back the whole batch when one item doesn't exist, even after earlier ones were moved", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      await expect(
        bulkMoveItems(tx, {
          ...BASE,
          languageId,
          learningItemIds: [ITEM_CASA_ID, randomUUID()],
          levelId: LEVEL_2_ID,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CURRICULUM_ITEM_NOT_FOUND" });
      expect((await placeOf(tx, ITEM_CASA_ID)).levelId).toBe(level1Id);
    });
  });

  it("is applied once however many times the same request arrives — and the same key is refused for any other destination", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const request = {
        ...BASE,
        languageId,
        learningItemIds: [ITEM_CASA_ID],
        levelId: LEVEL_2_ID,
        idempotencyKey: randomUUID(),
      };

      const first = await bulkMoveItems(tx, request);
      const placed = await placeOf(tx, ITEM_CASA_ID);
      const again = await bulkMoveItems(tx, request);

      expect(again).toEqual(first);
      expect(await placeOf(tx, ITEM_CASA_ID)).toEqual(placed);
      expect(await auditCount(tx, "CURRICULUM_ITEM_MOVED", ITEM_CASA_ID)).toBe(
        1,
      );

      // Another level, another group, or another language is another request:
      // answering it from the stored result would report a move that did not
      // happen.
      for (const different of [
        { ...request, levelId: level1Id },
        { ...request, vocabularyGroupId: VOCAB_GROUP_2_ID },
        { ...request, levelId: undefined, vocabularyGroupId: VOCAB_GROUP_ID },
        { ...request, languageId: randomUUID() },
      ]) {
        await expect(bulkMoveItems(tx, different)).rejects.toMatchObject({
          code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
        });
      }
      expect(await placeOf(tx, ITEM_CASA_ID)).toEqual(placed);
    });
  });
});

describe("moveItem — a single item", () => {
  it("refuses a level, or a group, of another language", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const other = await seedOtherLanguage(tx);
      const before = await placeOf(tx, ITEM_CASA_ID);

      await expect(
        moveItem(tx, {
          learningItemId: ITEM_CASA_ID,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          levelId: other.levelId,
        }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
      await expect(
        moveItem(tx, {
          learningItemId: ITEM_CASA_ID,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          vocabularyGroupId: other.groupId,
        }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
      expect(await placeOf(tx, ITEM_CASA_ID)).toEqual(before);
    });
  });
});

describe("bulkPublishPendingItems — the same request twice", () => {
  it("is answered from the stored result — published once, one audit event each — and the key is refused for any other request", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const first = await pendingItem(tx, languageId, level1Id, "perro");
      const second = await pendingItem(tx, languageId, level1Id, "nube");
      const request = {
        ...BASE,
        languageId,
        learningItemIds: [first, second],
        idempotencyKey: randomUUID(),
      };

      const answer = await bulkPublishPendingItems(tx, request);
      const again = await bulkPublishPendingItems(tx, request);

      expect(again).toEqual(answer);
      expect(await auditCount(tx, "CURRICULUM_ITEM_PUBLISHED", first)).toBe(1);
      expect(await auditCount(tx, "CURRICULUM_ITEM_PUBLISHED", second)).toBe(1);
      for (const different of [
        { ...request, learningItemIds: [first] },
        { ...request, languageId: randomUUID() },
      ]) {
        await expect(
          bulkPublishPendingItems(tx, different),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" });
      }
    });
  });
});

describe("bulkPublishPendingItems", () => {
  it("publishes every selected pending item, one audit event each, sharing a correlationId", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const first = await pendingItem(tx, languageId, level1Id, "perro");
      const second = await pendingItem(tx, languageId, level1Id, "nube");
      const idempotencyKey = randomUUID();

      const result = await bulkPublishPendingItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [first, second],
        idempotencyKey,
      });

      expect(result).toEqual({ publishedItemIds: [first, second] });
      expect((await placeOf(tx, first)).status).toBe("published");
      expect((await placeOf(tx, second)).status).toBe("published");
      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_PUBLISHED",
        limit: 20,
      });
      expect(
        audit.items.filter((e) => e.correlationId === idempotencyKey),
      ).toHaveLength(2);
    });
  });

  it("refuses the whole batch, as a conflict, publishing nothing, if any selected item isn't actually Pending", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const pending = await pendingItem(tx, languageId, level1Id, "silla");

      // ITEM_GATO_ID is already published in the fixture — mixing it into the batch must fail the whole thing.
      const attempt = bulkPublishPendingItems(tx, {
        ...BASE,
        languageId,
        learningItemIds: [pending, ITEM_GATO_ID],
        idempotencyKey: randomUUID(),
      });

      await expect(attempt).rejects.toMatchObject({
        code: "ADMIN_EDIT_CONFLICT",
        message:
          "Some of the selected items are no longer Pending — someone else may have published, archived or changed them. Reload the list and try again.",
      });
      // The item that legitimately was Pending must still be Pending — nothing published.
      expect((await placeOf(tx, pending)).status).toBe("pending");
      expect(await auditCount(tx, "CURRICULUM_ITEM_PUBLISHED", pending)).toBe(
        0,
      );
    });
  });

  it("refuses an archived item and a published one with unpublished changes, as readily as a published one", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const pending = await pendingItem(tx, languageId, level1Id, "mesa");
      await archiveItem(tx, {
        learningItemId: ITEM_AGUA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
      });
      await updateItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
        type: "vocabulary",
        fields: vocabFields("gato", "cat (edited)"),
      });

      for (const notPending of [ITEM_AGUA_ID, ITEM_GATO_ID]) {
        await expect(
          bulkPublishPendingItems(tx, {
            ...BASE,
            languageId,
            learningItemIds: [pending, notPending],
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
      }
      expect((await placeOf(tx, pending)).status).toBe("pending");
    });
  });

  it("refuses an item that belongs to another language", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const other = await seedOtherLanguage(tx);
      const pending = await pendingItem(tx, languageId, level1Id, "lampara");
      await tx
        .update(learningItems)
        .set({ status: "pending" })
        .where(eq(learningItems.id, other.itemId));

      await expect(
        bulkPublishPendingItems(tx, {
          ...BASE,
          languageId,
          learningItemIds: [pending, other.itemId],
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
      expect((await placeOf(tx, pending)).status).toBe("pending");
      expect((await placeOf(tx, other.itemId)).status).toBe("pending");
    });
  });
});

describe("every bulk command — what it will not even start", () => {
  const commands = [
    [
      "bulkArchiveItems",
      (tx: TestTx, ids: string[], languageId: string) =>
        bulkArchiveItems(tx, {
          ...BASE,
          languageId,
          learningItemIds: ids,
          idempotencyKey: randomUUID(),
        }),
    ],
    [
      "bulkMoveItems",
      (tx: TestTx, ids: string[], languageId: string) =>
        bulkMoveItems(tx, {
          ...BASE,
          languageId,
          learningItemIds: ids,
          levelId: LEVEL_2_ID,
          idempotencyKey: randomUUID(),
        }),
    ],
    [
      "bulkPublishPendingItems",
      (tx: TestTx, ids: string[], languageId: string) =>
        bulkPublishPendingItems(tx, {
          ...BASE,
          languageId,
          learningItemIds: ids,
          idempotencyKey: randomUUID(),
        }),
    ],
  ] as const;

  it.each(commands)(
    "%s refuses more than 100 items, none at all, a repeated item, and an id that is not one",
    async (_name, run) => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const lots = Array.from({ length: 101 }, () => randomUUID());

        for (const ids of [
          lots,
          [],
          [ITEM_CASA_ID, ITEM_CASA_ID],
          [ITEM_CASA_ID, ITEM_CASA_ID.toUpperCase()],
          ["not-an-id"],
        ]) {
          await expect(run(tx, ids, languageId)).rejects.toBeInstanceOf(
            ZodError,
          );
        }
        // Nothing was touched by any of them.
        expect((await placeOf(tx, ITEM_CASA_ID)).status).toBe("published");
      });
    },
  );

  it.each(commands)("%s accepts exactly 100 items", async (_name, run) => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      // A hundred names that don't exist: the guard lets them through to the
      // lookup, which refuses them as "no longer exists" — not as "too many".
      const hundred = Array.from({ length: 100 }, () => randomUUID());
      await expect(run(tx, hundred, languageId)).rejects.toMatchObject({
        code: "CURRICULUM_ITEM_NOT_FOUND",
      });
    });
  });
});

describe("reorderItems — the whole order, or nothing", () => {
  /** Level 90's vocabulary, as the fixture seeds it: gato 1, casa 2, agua 3. */
  const WHOLE_LEVEL = [ITEM_GATO_ID, ITEM_CASA_ID, ITEM_AGUA_ID];

  async function numbersOf(tx: TestTx, ids: string[]) {
    return Promise.all(
      ids.map(async (id) => {
        const { position, lessonPriority } = await placeOf(tx, id);
        return [position, lessonPriority];
      }),
    );
  }

  it("puts a level+type's items in the order given, and moves position and lesson priority together", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);

      await reorderItems(tx, {
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
        levelId: level1Id,
        type: "vocabulary",
        orderedLearningItemIds: [ITEM_AGUA_ID, ITEM_GATO_ID, ITEM_CASA_ID],
      });

      expect(
        await numbersOf(tx, [ITEM_AGUA_ID, ITEM_GATO_ID, ITEM_CASA_ID]),
      ).toEqual([
        [1, 1],
        [2, 2],
        [3, 3],
      ]);
    });
  });

  it("refuses a list that leaves an item out — a partial order — changing nothing", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      const before = await numbersOf(tx, WHOLE_LEVEL);

      await expect(
        reorderItems(tx, {
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          levelId: level1Id,
          type: "vocabulary",
          orderedLearningItemIds: [ITEM_AGUA_ID, ITEM_GATO_ID],
        }),
      ).rejects.toMatchObject({
        code: "ADMIN_EDIT_CONFLICT",
        message:
          "This level's items changed while you were arranging them. Reload to see the current order, then try again.",
      });
      expect(await numbersOf(tx, WHOLE_LEVEL)).toEqual(before);
      expect(await auditCount(tx, "CURRICULUM_ITEM_REORDERED", level1Id)).toBe(
        0,
      );
    });
  });

  it("counts an archived item as part of the order: a list without it is partial too", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      await archiveItem(tx, {
        learningItemId: ITEM_AGUA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
      });

      await expect(
        reorderItems(tx, {
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          levelId: level1Id,
          type: "vocabulary",
          orderedLearningItemIds: [ITEM_CASA_ID, ITEM_GATO_ID],
        }),
      ).rejects.toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
      await reorderItems(tx, {
        actorUserId: DEVELOPER_ID,
        idempotencyKey: randomUUID(),
        levelId: level1Id,
        type: "vocabulary",
        orderedLearningItemIds: [ITEM_CASA_ID, ITEM_GATO_ID, ITEM_AGUA_ID],
      });
      expect((await placeOf(tx, ITEM_CASA_ID)).position).toBe(1);
    });
  });

  it("refuses a list that names an item of another level or another type — it is not skipped, the whole list is refused", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      const before = await numbersOf(tx, [...WHOLE_LEVEL, ITEM_ROJO_ID]);

      for (const stranger of [ITEM_ROJO_ID, ITEM_Y_ID]) {
        await expect(
          reorderItems(tx, {
            actorUserId: DEVELOPER_ID,
            idempotencyKey: randomUUID(),
            levelId: level1Id,
            type: "vocabulary",
            orderedLearningItemIds: [stranger, ...WHOLE_LEVEL],
          }),
        ).rejects.toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
      }
      expect(await numbersOf(tx, [...WHOLE_LEVEL, ITEM_ROJO_ID])).toEqual(
        before,
      );
    });
  });

  it("refuses an item named twice, and a list longer than the tool can arrange", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      await expect(
        reorderItems(tx, {
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          levelId: level1Id,
          type: "vocabulary",
          orderedLearningItemIds: [ITEM_GATO_ID, ITEM_GATO_ID, ITEM_CASA_ID],
        }),
      ).rejects.toBeInstanceOf(ZodError);
      await expect(
        reorderItems(tx, {
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          levelId: level1Id,
          type: "vocabulary",
          orderedLearningItemIds: Array.from({ length: 101 }, () =>
            randomUUID(),
          ),
        }),
      ).rejects.toBeInstanceOf(ZodError);
    });
  });

  it("will not arrange a level+type that has more items than the tool can hold — and says why — instead of ordering a part of it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const [level] = await tx
        .insert(levels)
        .values({
          languageId,
          levelNumber: 7_100 + Math.floor(Math.random() * 800),
          name: "Crowded",
          status: "draft",
        })
        .returning({ id: levels.id });
      const ids = Array.from({ length: 101 }, () => randomUUID());
      await tx.insert(learningItems).values(
        ids.map((id, index) => ({
          id,
          languageId,
          levelId: level!.id,
          type: "vocabulary" as const,
          status: "pending" as const,
          position: index + 1,
          lessonPriority: index + 1,
        })),
      );

      await expect(
        reorderItems(tx, {
          actorUserId: DEVELOPER_ID,
          idempotencyKey: randomUUID(),
          levelId: level!.id,
          type: "vocabulary",
          orderedLearningItemIds: ids.slice(0, 100),
        }),
      ).rejects.toMatchObject({
        code: "CURRICULUM_VALIDATION_FAILED",
        message: expect.stringContaining("more than 100 vocabulary items"),
      });
      // Nothing was renumbered.
      expect((await placeOf(tx, ids[0]!)).position).toBe(1);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concurrent requests                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The rolled-back single-transaction harness cannot produce two requests at
 * once, so these commit real rows (named so they can be found again) and remove
 * them afterwards — the same approach as the Users role tests. A test that is
 * killed cannot run its own cleanup, so the file also clears what an earlier
 * run left, before it starts and after it ends: leftover audit events would
 * break unrelated tests that expect an empty table.
 */
const FIXTURE_LEVEL_NAME = "bulk-fixture-level";
const FIXTURE_ACTOR_PREFIX = "clerk-bulk-fixture-";

async function purgeBulkFixtures() {
  const actors = await testDb
    .select({ id: users.id })
    .from(users)
    .where(like(users.clerkUserId, `${FIXTURE_ACTOR_PREFIX}%`));
  const fixtureLevels = await testDb
    .select({ id: levels.id })
    .from(levels)
    .where(eq(levels.name, FIXTURE_LEVEL_NAME));
  const levelIds = fixtureLevels.map((level) => level.id);
  const items = levelIds.length
    ? await testDb
        .select({ id: learningItems.id })
        .from(learningItems)
        .where(inArray(learningItems.levelId, levelIds))
    : [];
  const itemIds = items.map((item) => item.id);

  if (itemIds.length) {
    await testDb
      .delete(adminAuditEvents)
      .where(inArray(adminAuditEvents.resourceId, itemIds));
  }
  if (actors.length) {
    await testDb.delete(adminAuditEvents).where(
      inArray(
        adminAuditEvents.actorUserId,
        actors.map((actor) => actor.id),
      ),
    );
  }
  if (itemIds.length) {
    await testDb
      .delete(vocabularyItems)
      .where(inArray(vocabularyItems.learningItemId, itemIds));
    await testDb
      .delete(learningItems)
      .where(inArray(learningItems.id, itemIds));
  }
  if (levelIds.length) {
    await testDb
      .delete(vocabularyGroups)
      .where(inArray(vocabularyGroups.levelId, levelIds));
    await testDb.delete(levels).where(inArray(levels.id, levelIds));
  }
  if (actors.length) {
    await testDb.delete(users).where(
      inArray(
        users.id,
        actors.map((actor) => actor.id),
      ),
    );
  }
}

/**
 * A committed Admin actor, a level with a group, and `count` items of the given
 * status. `ids` is in ascending id order. By default positions follow it;
 * `positionsAgainstIds` reverses them (and inserts the rows in that order), so a
 * lock taken in position order and one taken in id order cross each other.
 */
async function committedScene(
  count: number,
  status: "pending" | "published",
  options: { positionsAgainstIds?: boolean } = {},
) {
  const [language] = await testDb
    .insert(languages)
    .values({ code: "es-MX", slug: "spanish", name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning({ id: languages.id });
  const languageId =
    language?.id ??
    (
      await testDb
        .select({ id: languages.id })
        .from(languages)
        .where(eq(languages.code, "es-MX"))
    )[0]!.id;
  const [actor] = await testDb
    .insert(users)
    .values({
      clerkUserId: `${FIXTURE_ACTOR_PREFIX}${randomUUID()}`,
      role: "admin",
      activeLanguageId: languageId,
    })
    .returning({ id: users.id });
  const [level] = await testDb
    .insert(levels)
    .values({
      languageId,
      levelNumber: 8_000 + Math.floor(Math.random() * 1_900),
      name: FIXTURE_LEVEL_NAME,
      status: "draft",
    })
    .returning({ id: levels.id });
  const [group] = await testDb
    .insert(vocabularyGroups)
    .values({
      languageId,
      levelId: level!.id,
      name: "Bulk fixture group",
      position: 1,
      status: "draft",
    })
    .returning({ id: vocabularyGroups.id });
  const ids = Array.from({ length: count }, () => randomUUID());
  if (options.positionsAgainstIds) ids.sort();
  const positionOf = (index: number) =>
    options.positionsAgainstIds ? count - index : index + 1;
  // Rows go in by position, so the table's own (physical) order is the position order too.
  const byPosition = ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => positionOf(a.index) - positionOf(b.index));
  await testDb.insert(learningItems).values(
    byPosition.map(({ id, index }) => ({
      id,
      languageId,
      levelId: level!.id,
      type: "vocabulary" as const,
      status,
      position: positionOf(index),
      lessonPriority: positionOf(index),
    })),
  );
  await testDb.insert(vocabularyItems).values(
    byPosition.map(({ id, index }) => ({
      learningItemId: id,
      vocabularyGroupId: group!.id,
      term: `bulk-${index}-${id.slice(0, 6)}`,
      primaryMeaning: "bulk fixture",
      partOfSpeech: "noun",
    })),
  );
  return { languageId, actorId: actor!.id, levelId: level!.id, ids };
}

/** Waits until `waiters` sessions are blocked on another transaction's row — proof a batch is really queued behind an edit that has not committed. */
async function waitUntilSomeoneWaitsOnARow(
  outcome: () => { error?: unknown } | undefined,
  waiters = 1,
) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const finished = outcome();
    if (finished) {
      throw new Error(
        `the batch finished without waiting on the row: ${
          finished.error instanceof Error
            ? `${finished.error.name}: ${finished.error.message}`
            : "it succeeded"
        }`,
      );
    }
    const result = await testDb.execute(
      // The first session to wait on a row waits on the holder's transaction; any
      // others queue behind it on the row itself (a `tuple` lock).
      sql`select count(*)::int as n from pg_locks where locktype in ('transactionid', 'tuple') and not granted`,
    );
    if (((result.rows[0] as { n: number } | undefined)?.n ?? 0) >= waiters)
      return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the batch never waited on the row");
}

describe("bulk commands under concurrent requests (real transactions)", () => {
  beforeAll(purgeBulkFixtures);
  afterAll(purgeBulkFixtures);

  it("lets two overlapping batches, naming the same items in opposite orders, take turns — neither fails, and nothing is archived twice", async () => {
    const scene = await committedScene(12, "published");
    try {
      const forwards = scene.ids;
      const backwards = [...scene.ids].reverse();
      for (let round = 0; round < 2; round++) {
        const results = await Promise.all([
          bulkArchiveItems(testDb, {
            actorUserId: scene.actorId,
            languageId: scene.languageId,
            learningItemIds: forwards,
            idempotencyKey: randomUUID(),
          }),
          bulkArchiveItems(testDb, {
            actorUserId: scene.actorId,
            languageId: scene.languageId,
            learningItemIds: backwards,
            idempotencyKey: randomUUID(),
          }),
        ]);
        // Whichever got there first archived them all (in the first round); the other
        // found them already archived and left them alone.
        const archived = results.flatMap((result) => result.archivedItemIds);
        if (round === 0) expect(archived.sort()).toEqual([...scene.ids].sort());
        else expect(archived).toEqual([]);
      }
      for (const id of scene.ids) {
        const events = await testDb
          .select({ id: adminAuditEvents.id })
          .from(adminAuditEvents)
          .where(
            and(
              eq(adminAuditEvents.resourceId, id),
              eq(adminAuditEvents.action, "CURRICULUM_ITEM_ARCHIVED"),
            ),
          );
        expect(events).toHaveLength(1);
      }
    } finally {
      await purgeBulkFixtures();
    }
  }, 90_000);

  it("lets a reorder and a bulk archive that want the same rows in different orders take turns — neither is aborted as a deadlock", async () => {
    // Three items whose id order is the reverse of their position order, so a
    // lock taken in position order and one taken in id order cross each other.
    const scene = await committedScene(3, "published", {
      positionsAgainstIds: true,
    });
    try {
      const [first, middle, last] = scene.ids as [string, string, string];

      let reorder: Promise<unknown> | undefined;
      let archive: Promise<unknown> | undefined;
      await testDb.transaction(async (holder) => {
        // Someone holds the middle row, which both batches will need...
        await holder
          .select({ id: learningItems.id })
          .from(learningItems)
          .where(eq(learningItems.id, middle))
          .for("update");
        // ...when a reorder (the level's whole list) and a bulk archive arrive.
        reorder = reorderItems(testDb, {
          actorUserId: scene.actorId,
          idempotencyKey: randomUUID(),
          levelId: scene.levelId,
          type: "vocabulary",
          orderedLearningItemIds: [last, middle, first],
        });
        archive = bulkArchiveItems(testDb, {
          actorUserId: scene.actorId,
          languageId: scene.languageId,
          learningItemIds: [first, middle, last],
          idempotencyKey: randomUUID(),
        });
        let finished: { error?: unknown } | undefined;
        for (const request of [reorder, archive]) {
          request.then(
            () => undefined,
            (error) => (finished = { error }),
          );
        }
        await waitUntilSomeoneWaitsOnARow(() => finished, 2);
        // Leaving the callback commits, and lets both go on.
      });

      const outcomes = await Promise.allSettled([reorder!, archive!]);
      // A deadlock would abort one of the two ("deadlock detected").
      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      const rows = await testDb
        .select({
          id: learningItems.id,
          status: learningItems.status,
          position: learningItems.position,
          lessonPriority: learningItems.lessonPriority,
        })
        .from(learningItems)
        .where(inArray(learningItems.id, scene.ids));
      expect(rows.map((row) => row.status)).toEqual([
        "archived",
        "archived",
        "archived",
      ]);
      expect(rows.map((row) => row.position).sort()).toEqual([1, 2, 3]);
      expect(rows.map((row) => row.lessonPriority).sort()).toEqual([1, 2, 3]);
    } finally {
      await purgeBulkFixtures();
    }
  }, 90_000);

  it("refuses a bulk publish whose list went stale while it waited — one item published by someone else — and publishes none of the others", async () => {
    const scene = await committedScene(3, "pending");
    try {
      const [first, second, third] = scene.ids as [string, string, string];

      let batch: Promise<unknown> | undefined;
      await testDb.transaction(async (tx1) => {
        // Someone else publishes the middle one, and has not committed yet...
        await publishItem(tx1, {
          learningItemId: second,
          expectedVersion: 1,
          actorUserId: scene.actorId,
          idempotencyKey: randomUUID(),
        });
        // ...when the Admin's batch, from a list that still shows all three Pending, arrives.
        batch = bulkPublishPendingItems(testDb, {
          actorUserId: scene.actorId,
          languageId: scene.languageId,
          learningItemIds: [first, second, third],
          idempotencyKey: randomUUID(),
        });
        let finished: { error?: unknown } | undefined;
        batch.then(
          () => (finished = {}),
          (error) => (finished = { error }),
        );
        await waitUntilSomeoneWaitsOnARow(() => finished);
        // Leaving the callback commits the other publication.
      });

      await expect(batch!).rejects.toMatchObject({
        code: "ADMIN_EDIT_CONFLICT",
      });
      // The one that was published elsewhere stays so; the others were not published by the batch.
      const statuses = await testDb
        .select({ id: learningItems.id, status: learningItems.status })
        .from(learningItems)
        .where(inArray(learningItems.id, scene.ids));
      const byId = new Map(statuses.map((row) => [row.id, row.status]));
      expect([byId.get(first), byId.get(second), byId.get(third)]).toEqual([
        "pending",
        "published",
        "pending",
      ]);
    } finally {
      await purgeBulkFixtures();
    }
  }, 60_000);
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
