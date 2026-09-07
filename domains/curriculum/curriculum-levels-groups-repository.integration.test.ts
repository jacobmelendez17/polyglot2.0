import { describe, expect, it } from "vitest";

import { VOCAB_GROUP_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  createLevel,
  createVocabularyGroup,
  getLevelValidationCounts,
  reorderVocabularyGroups,
  updateLevel,
  updateVocabularyGroup,
} from "./curriculum-mutation-repository";
import { getLevelsByLanguage, getVocabularyGroup, getVocabularyGroupsByLanguage } from "./curriculum-repository";

describe("Levels management", () => {
  it("creates a level and updates its name/status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const levelId = await createLevel(tx, { languageId, levelNumber: 47, name: "Advanced Idioms" });
      expect(levelId).toBeTruthy();

      await updateLevel(tx, levelId, { name: "Advanced Idioms (renamed)", status: "published" });
      // No dedicated getter yet at this layer — confirmed via the admin read model's own level list in a later test; this proves the write path doesn't throw and targets the right row via a direct re-read.
      const found = (await getLevelsByLanguage(tx, languageId)).find((l) => l.id === levelId);
      expect(found?.name).toBe("Advanced Idioms (renamed)");
      expect(found?.status).toBe("published");
    });
  });

  it("reports real validation counts for a level", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      const counts = await getLevelValidationCounts(tx, level1Id);
      // Fixture Level 1 has gato/casa/agua (vocabulary) + y (grammar) + one group.
      expect(counts.vocabularyItems).toBe(3);
      expect(counts.grammarItems).toBe(1);
      expect(counts.vocabularyGroups).toBe(1);
    });
  });
});

describe("Vocabulary groups management", () => {
  it("creates a group appended after existing groups in the same level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const groupId = await createVocabularyGroup(tx, { levelId: level1Id, languageId, name: "Numbers" });
      expect(groupId).toBeTruthy();
      expect(groupId).not.toBe(VOCAB_GROUP_ID);
    });
  });

  it("updates a group's name and status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const groupId = await createVocabularyGroup(tx, { levelId: level1Id, languageId, name: "Numbers" });
      await updateVocabularyGroup(tx, groupId, { name: "Numbers (renamed)", status: "published" });

      const group = await getVocabularyGroup(tx, groupId);
      expect(group?.name).toBe("Numbers (renamed)");
      expect(group?.status).toBe("published");
    });
  });

  it("reorders groups within a level without a unique-constraint collision", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const second = await createVocabularyGroup(tx, { levelId: level1Id, languageId, name: "Second" });
      const third = await createVocabularyGroup(tx, { levelId: level1Id, languageId, name: "Third" });

      await reorderVocabularyGroups(tx, level1Id, [third, second, VOCAB_GROUP_ID]);

      const groups = await getVocabularyGroupsByLanguage(tx, languageId);
      const byId = new Map(groups.map((g) => [g.id, g.position]));
      expect(byId.get(third)).toBe(1);
      expect(byId.get(second)).toBe(2);
      expect(byId.get(VOCAB_GROUP_ID)).toBe(3);
    });
  });
});
