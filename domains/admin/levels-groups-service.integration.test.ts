import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getLevelsByLanguage, getVocabularyGroup, getVocabularyGroupsByLanguage } from "@/domains/curriculum/curriculum-repository";

import { getAuditEvents } from "./audit-repository";
import { createLevel, createVocabularyGroup, reorderVocabularyGroups, updateLevel, updateVocabularyGroup } from "./publication-service";

describe("createLevel", () => {
  it("creates a level and records LEVEL_CREATED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 99,
        name: "Bonus",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const found = (await getLevelsByLanguage(tx, languageId)).find((l) => l.id === levelId);
      expect(found?.name).toBe("Bonus");

      const audit = await getAuditEvents(tx, { action: "LEVEL_CREATED", resourceId: levelId, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });
});

describe("updateLevel", () => {
  it("publishes a level on an Admin's say-so, whatever it contains (spec 17)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      // Empty: no vocabulary, no groups, no grammar. This used to be refused
      // for failing a 48/4/12 count, which made every level one fixed shape.
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 96,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await updateLevel(tx, { levelId, status: "published", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() });

      const published = (await getLevelsByLanguage(tx, languageId)).find((level) => level.id === levelId);
      expect(published?.status).toBe("published");
    });
  });

  it("updates a level's name and records LEVEL_UPDATED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 98,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await updateLevel(tx, { levelId, name: "Renamed", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() });

      const found = (await getLevelsByLanguage(tx, languageId)).find((l) => l.id === levelId);
      expect(found?.name).toBe("Renamed");
      const audit = await getAuditEvents(tx, { action: "LEVEL_UPDATED", resourceId: levelId, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });




});

describe("createVocabularyGroup", () => {
  it("creates a group and records GROUP_CREATED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { groupId } = await createVocabularyGroup(tx, {
        levelId: level1Id,
        languageId,
        name: "Food",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const audit = await getAuditEvents(tx, { action: "GROUP_CREATED", resourceId: groupId, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });
});

describe("updateVocabularyGroup", () => {
  it("updates a group's name and records GROUP_UPDATED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { groupId } = await createVocabularyGroup(tx, {
        levelId: level1Id,
        languageId,
        name: "Food",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await updateVocabularyGroup(tx, { groupId, name: "Food & Drink", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() });

      const group = await getVocabularyGroup(tx, groupId);
      expect(group?.name).toBe("Food & Drink");
      const audit = await getAuditEvents(tx, { action: "GROUP_UPDATED", resourceId: groupId, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });

  it("archiving a group records GROUP_ARCHIVED instead of GROUP_UPDATED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { groupId } = await createVocabularyGroup(tx, {
        levelId: level1Id,
        languageId,
        name: "Food",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await updateVocabularyGroup(tx, { groupId, status: "archived", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() });

      const group = await getVocabularyGroup(tx, groupId);
      expect(group?.status).toBe("archived");
      const archived = await getAuditEvents(tx, { action: "GROUP_ARCHIVED", resourceId: groupId, limit: 10 });
      expect(archived.items).toHaveLength(1);
      const updated = await getAuditEvents(tx, { action: "GROUP_UPDATED", resourceId: groupId, limit: 10 });
      expect(updated.items).toHaveLength(0);
    });
  });
});

describe("reorderVocabularyGroups", () => {
  it("reorders groups and records one GROUP_REORDERED event for the whole batch", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      // Its own level: reordering assigns positions 1..n to exactly the
      // groups it is handed, and the shared fixture Level 1 also holds the
      // real curriculum's four groups (`TEST_DATABASE_URL` and
      // `DATABASE_URL` are the same database), which a partial reorder there
      // would collide with rather than test.
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 64,
        name: "Group reorder fixture",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      const groupIds: string[] = [];
      for (const name of ["First", "Second", "Third"]) {
        groupIds.push(
          (
            await createVocabularyGroup(tx, {
              levelId,
              languageId,
              name,
              actorUserId: DEVELOPER_ID,
              idempotencyKey: crypto.randomUUID(),
            })
          ).groupId,
        );
      }
      const [first, second, third] = groupIds;

      await reorderVocabularyGroups(tx, {
        levelId,
        orderedGroupIds: [third!, second!, first!],
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const groups = await getVocabularyGroupsByLanguage(tx, languageId);
      const byId = new Map(groups.map((g) => [g.id, g.position]));
      expect(byId.get(third!)).toBe(1);
      expect(byId.get(second!)).toBe(2);
      expect(byId.get(first!)).toBe(3);

      const audit = await getAuditEvents(tx, { action: "GROUP_REORDERED", resourceId: levelId, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });
});
