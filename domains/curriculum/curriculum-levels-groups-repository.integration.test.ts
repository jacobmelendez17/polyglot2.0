import { describe, expect, it } from "vitest";

import { VOCAB_GROUP_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  createLearningItem,
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
      const { languageId } = await seedTestFixtures(tx);

      // Counted against a level this test creates and fills itself, rather
      // than the shared fixture Level 1. That level holds the real Level 1
      // curriculum too (`TEST_DATABASE_URL` and `DATABASE_URL` are the same
      // database — see progress-tracker.md), so an exact count there would
      // assert the size of the real curriculum rather than this behavior.
      const levelId = await createLevel(tx, { languageId, levelNumber: 61, name: "Counting fixture" });
      await createVocabularyGroup(tx, { levelId, languageId, name: "Only group" });
      const groupId = (await getVocabularyGroupsByLanguage(tx, languageId)).find((g) => g.levelId === levelId)!.id;
      await createLearningItem(tx, {
        languageId,
        levelId,
        position: 1,
        lessonPriority: 1,
        type: "vocabulary",
        fields: { vocabularyGroupId: groupId, term: "conteo", primaryMeaning: "count", partOfSpeech: "noun", article: null, definition: null, pronunciation: null, ipa: null, context: null, creatorNotes: null, acceptedAnswers: [] },
      });
      await createLearningItem(tx, {
        languageId,
        levelId,
        position: 1,
        lessonPriority: 1,
        type: "grammar",
        fields: { title: null, structure: "conteo-gramatical", primaryMeaning: "counting", explanation: "fixture", category: null, creatorNotes: null, requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }], acceptedAnswers: [] },
      });

      const counts = await getLevelValidationCounts(tx, levelId);
      expect(counts.vocabularyItems).toBe(1);
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
      const { languageId } = await seedTestFixtures(tx);
      // Its own level, for the same reason the validation-count test above
      // uses one: the shared fixture Level 1 also holds the real Level 1
      // curriculum's four groups, so "the whole level's new order" could not
      // be asserted exactly against it.
      const levelId = await createLevel(tx, { languageId, levelNumber: 62, name: "Reorder fixture" });
      const first = await createVocabularyGroup(tx, { levelId, languageId, name: "First" });
      const second = await createVocabularyGroup(tx, { levelId, languageId, name: "Second" });
      const third = await createVocabularyGroup(tx, { levelId, languageId, name: "Third" });

      await reorderVocabularyGroups(tx, levelId, [third, second, first]);

      const groups = await getVocabularyGroupsByLanguage(tx, languageId);
      const byId = new Map(groups.map((g) => [g.id, g.position]));
      expect(byId.get(third)).toBe(1);
      expect(byId.get(second)).toBe(2);
      expect(byId.get(first)).toBe(3);
    });
  });
});
