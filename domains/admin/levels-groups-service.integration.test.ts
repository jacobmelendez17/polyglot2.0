import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
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
      // A level of this test's own, empty and with no targets set, so it
      // falls back to the configured defaults. Deliberately not the seeded
      // Level 1: that row is shared with the dev branch and may carry its own
      // per-level targets, which would make this assertion depend on someone
      // else's configuration rather than on the rule under test.
      const { languageId } = await seedTestFixtures(tx);
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 95,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updateLevel(tx, { levelId, status: "published", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
    });
  });

  it("publishes a deliberately small level once its own targets are satisfied", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 94,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      const groupId = await repoCreateVocabularyGroup(tx, { levelId, languageId, name: "Only group" });
      await createLearningItem(tx, {
        languageId,
        levelId,
        position: 1,
        lessonPriority: 1,
        type: "vocabulary",
        fields: { vocabularyGroupId: groupId, term: "solo", primaryMeaning: "alone", partOfSpeech: "adjective", acceptedAnswers: [] },
      });

      // One vocabulary item, one group, no grammar — far below every default,
      // and unpublishable until the level says that is its intended shape.
      await expect(
        updateLevel(tx, { levelId, status: "published", actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });

      // Targets set in the same save are what the publish is checked against.
      await updateLevel(tx, {
        levelId,
        status: "published",
        targets: { vocabularyItems: 1, vocabularyGroups: 1, grammarItems: 0 },
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      const published = (await getLevelsByLanguage(tx, languageId)).find((level) => level.id === levelId);
      expect(published?.status).toBe("published");
      expect(published?.targets).toEqual({ vocabularyItems: 1, vocabularyGroups: 1, grammarItems: 0 });
    });
  });

  it("keeps the configured defaults for any target the level leaves unset", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const { levelId } = await createLevel(tx, {
        languageId,
        levelNumber: 93,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      // Only the vocabulary target is lowered; grammar and groups still use
      // the defaults, so publishing must still be refused.
      await expect(
        updateLevel(tx, {
          levelId,
          status: "published",
          targets: { vocabularyItems: 0 },
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
        }),
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
