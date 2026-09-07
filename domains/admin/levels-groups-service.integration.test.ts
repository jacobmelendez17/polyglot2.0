import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, VOCAB_GROUP_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  createLearningItem,
  createVocabularyGroup as repoCreateVocabularyGroup,
} from "@/domains/curriculum/curriculum-mutation-repository";
import { getLevelsByLanguage, getVocabularyGroup, getVocabularyGroupsByLanguage } from "@/domains/curriculum/curriculum-repository";
import { CURRICULUM_VALIDATION_CONFIG } from "@/domains/curriculum/curriculum-validation-config";

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

  it("rejects publishing a level that doesn't meet the configured curriculum counts", async () => {
    await withTestTransaction(async (tx) => {
      // Fixture Level 1 has 3 vocabulary / 1 grammar / 1 group — well under every configured threshold.
      const { level1Id } = await seedTestFixtures(tx);

      await expect(
        updateLevel(tx, { levelId: level1Id, status: "published", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
    });
  });

  it("publishes a level once every configured curriculum count is satisfied", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 97,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const groupIds: string[] = [];
      for (let i = 0; i < CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel; i++) {
        groupIds.push(await repoCreateVocabularyGroup(tx, { levelId, languageId, name: `Group ${i}` }));
      }

      for (let i = 0; i < CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel; i++) {
        await createLearningItem(tx, {
          languageId,
          levelId,
          position: i + 1,
          lessonPriority: i + 1,
          type: "vocabulary",
          fields: {
            vocabularyGroupId: groupIds[i % groupIds.length]!,
            term: `word-${i}`,
            primaryMeaning: `meaning-${i}`,
            partOfSpeech: "noun",
            acceptedAnswers: [],
          },
        });
      }

      for (let i = 0; i < CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel; i++) {
        await createLearningItem(tx, {
          languageId,
          levelId,
          position: i + 1,
          lessonPriority: i + 1,
          type: "grammar",
          fields: {
            structure: `structure-${i}`,
            primaryMeaning: `meaning-${i}`,
            explanation: `explanation-${i}`,
            requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
            acceptedAnswers: [],
          },
        });
      }

      await updateLevel(tx, { levelId, status: "published", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() });

      const found = (await getLevelsByLanguage(tx, languageId)).find((l) => l.id === levelId);
      expect(found?.status).toBe("published");
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
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const second = (
        await createVocabularyGroup(tx, {
          levelId: level1Id,
          languageId,
          name: "Second",
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
        })
      ).groupId;
      const third = (
        await createVocabularyGroup(tx, {
          levelId: level1Id,
          languageId,
          name: "Third",
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
        })
      ).groupId;

      await reorderVocabularyGroups(tx, {
        levelId: level1Id,
        orderedGroupIds: [third, second, VOCAB_GROUP_ID],
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const groups = await getVocabularyGroupsByLanguage(tx, languageId);
      const byId = new Map(groups.map((g) => [g.id, g.position]));
      expect(byId.get(third)).toBe(1);
      expect(byId.get(second)).toBe(2);
      expect(byId.get(VOCAB_GROUP_ID)).toBe(3);

      const audit = await getAuditEvents(tx, { action: "GROUP_REORDERED", resourceId: level1Id, limit: 10 });
      expect(audit.items).toHaveLength(1);
    });
  });
});
