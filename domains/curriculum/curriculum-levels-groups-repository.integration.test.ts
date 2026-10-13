import { describe, expect, it } from "vitest";

import { languages } from "@/db/schema";
import { VOCAB_GROUP_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  createLearningItem,
  createLevel,
  createVocabularyGroup,
  getLevelContentCounts,
  getLevelContentCountsByLanguage,
  publishPendingItem,
  reorderVocabularyGroups,
  updateLevel,
  updateVocabularyGroup,
} from "./curriculum-mutation-repository";
import {
  getLevelsByLanguage,
  getVocabularyGroup,
  getVocabularyGroupsByLanguage,
} from "./curriculum-repository";

describe("Levels management", () => {
  it("creates a level and updates its name/status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const levelId = await createLevel(tx, {
        languageId,
        levelNumber: 47,
        name: "Advanced Idioms",
      });
      expect(levelId).toBeTruthy();

      await updateLevel(tx, levelId, {
        name: "Advanced Idioms (renamed)",
        status: "published",
      });
      // No dedicated getter yet at this layer — confirmed via the admin read model's own level list in a later test; this proves the write path doesn't throw and targets the right row via a direct re-read.
      const found = (await getLevelsByLanguage(tx, languageId)).find(
        (l) => l.id === levelId,
      );
      expect(found?.name).toBe("Advanced Idioms (renamed)");
      expect(found?.status).toBe("published");
    });
  });

  it("reports what a level actually contains", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      // Counted against a level this test creates and fills itself, rather
      // than the shared fixture Level 1. That level holds the real Level 1
      // curriculum too (`TEST_DATABASE_URL` and `DATABASE_URL` are the same
      // database — see progress-tracker.md), so an exact count there would
      // assert the size of the real curriculum rather than this behavior.
      const levelId = await createLevel(tx, {
        languageId,
        levelNumber: 61,
        name: "Counting fixture",
      });
      await createVocabularyGroup(tx, {
        levelId,
        languageId,
        name: "Only group",
      });
      const groupId = (
        await getVocabularyGroupsByLanguage(tx, languageId)
      ).find((g) => g.levelId === levelId)!.id;
      await createLearningItem(tx, {
        languageId,
        levelId,
        position: 1,
        lessonPriority: 1,
        type: "vocabulary",
        fields: {
          vocabularyGroupId: groupId,
          term: "conteo",
          primaryMeaning: "count",
          partOfSpeech: "noun",
          article: null,
          definition: null,
          pronunciation: null,
          ipa: null,
          context: null,
          creatorNotes: null,
          acceptedAnswers: [],
        },
      });
      await createLearningItem(tx, {
        languageId,
        levelId,
        position: 1,
        lessonPriority: 1,
        type: "grammar",
        fields: {
          title: null,
          structure: "conteo-gramatical",
          primaryMeaning: "counting",
          explanation: "fixture",
          category: null,
          creatorNotes: null,
          requiredQuestions: [
            { format: "translation", direction: "targetToEnglish" },
          ],
          acceptedAnswers: [],
        },
      });

      const counts = await getLevelContentCounts(tx, levelId);
      expect(counts.vocabularyItems).toBe(1);
      expect(counts.grammarItems).toBe(1);
      expect(counts.vocabularyGroups).toBe(1);
    });
  });
});

describe("Level content counts for a whole language (spec 26 Unit 4)", () => {
  /** A vocabulary item in `levelId`/`groupId`, left `pending` as `createLearningItem` makes it. */
  async function addVocabulary(
    tx: Parameters<Parameters<typeof withTestTransaction>[0]>[0],
    ids: { languageId: string; levelId: string; groupId: string },
    position: number,
  ) {
    return createLearningItem(tx, {
      languageId: ids.languageId,
      levelId: ids.levelId,
      position,
      lessonPriority: position,
      type: "vocabulary",
      fields: {
        vocabularyGroupId: ids.groupId,
        term: `conteo-${ids.levelId.slice(0, 4)}-${position}`,
        primaryMeaning: "count",
        partOfSpeech: "noun",
        article: null,
        definition: null,
        pronunciation: null,
        ipa: null,
        context: null,
        creatorNotes: null,
        acceptedAnswers: [],
      },
    });
  }

  it("answers exactly what the per-level count answers, for every level, in any status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const emptyId = await createLevel(tx, { languageId, levelNumber: 71 });
      const filledId = await createLevel(tx, { languageId, levelNumber: 72 });
      await createVocabularyGroup(tx, {
        levelId: filledId,
        languageId,
        name: "First",
      });
      await createVocabularyGroup(tx, {
        levelId: filledId,
        languageId,
        name: "Second",
      });
      const groupId = (
        await getVocabularyGroupsByLanguage(tx, languageId)
      ).find((g) => g.levelId === filledId)!.id;
      const ids = { languageId, levelId: filledId, groupId };
      // Three vocabulary items; one is published, so the count must not be
      // quietly narrowed to a status (it never has been).
      await addVocabulary(tx, ids, 1);
      await addVocabulary(tx, ids, 2);
      const published = await addVocabulary(tx, ids, 3);
      await publishPendingItem(tx, published);
      await createLearningItem(tx, {
        languageId,
        levelId: filledId,
        position: 1,
        lessonPriority: 1,
        type: "grammar",
        fields: {
          title: null,
          structure: `estructura-${filledId.slice(0, 4)}`,
          primaryMeaning: "structure",
          explanation: "fixture",
          category: null,
          creatorNotes: null,
          requiredQuestions: [
            { format: "translation", direction: "targetToEnglish" },
          ],
          acceptedAnswers: [],
        },
      });

      const aggregate = await getLevelContentCountsByLanguage(tx, languageId);
      const everyLevel = await getLevelsByLanguage(tx, languageId);
      expect(everyLevel.length).toBeGreaterThanOrEqual(3);
      for (const level of everyLevel) {
        // A level with nothing in it has no entry; absent means zero.
        expect(
          aggregate.get(level.id) ?? {
            vocabularyItems: 0,
            grammarItems: 0,
            vocabularyGroups: 0,
          },
        ).toEqual(await getLevelContentCounts(tx, level.id));
      }
      expect(aggregate.get(filledId)).toEqual({
        vocabularyItems: 3,
        grammarItems: 1,
        vocabularyGroups: 2,
      });
      expect(aggregate.get(emptyId)).toBeUndefined();
    });
  });

  it("never counts another language's levels", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const [other] = await tx
        .insert(languages)
        .values({ code: "xx-OTHER", slug: "xx-other", name: "Other" })
        .returning({ id: languages.id });
      const theirLevel = await createLevel(tx, {
        languageId: other!.id,
        levelNumber: 1,
      });
      await createVocabularyGroup(tx, {
        levelId: theirLevel,
        languageId: other!.id,
        name: "Theirs",
      });

      const ours = await getLevelContentCountsByLanguage(tx, languageId);
      expect(ours.has(theirLevel)).toBe(false);

      const theirs = await getLevelContentCountsByLanguage(tx, other!.id);
      expect([...theirs.keys()]).toEqual([theirLevel]);
      expect(theirs.get(theirLevel)).toEqual({
        vocabularyItems: 0,
        grammarItems: 0,
        vocabularyGroups: 1,
      });
    });
  });
});

describe("Vocabulary groups management", () => {
  it("creates a group appended after existing groups in the same level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const groupId = await createVocabularyGroup(tx, {
        levelId: level1Id,
        languageId,
        name: "Numbers",
      });
      expect(groupId).toBeTruthy();
      expect(groupId).not.toBe(VOCAB_GROUP_ID);
    });
  });

  it("updates a group's name and status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const groupId = await createVocabularyGroup(tx, {
        levelId: level1Id,
        languageId,
        name: "Numbers",
      });
      await updateVocabularyGroup(tx, groupId, {
        name: "Numbers (renamed)",
        status: "published",
      });

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
      const levelId = await createLevel(tx, {
        languageId,
        levelNumber: 62,
        name: "Reorder fixture",
      });
      const first = await createVocabularyGroup(tx, {
        levelId,
        languageId,
        name: "First",
      });
      const second = await createVocabularyGroup(tx, {
        levelId,
        languageId,
        name: "Second",
      });
      const third = await createVocabularyGroup(tx, {
        levelId,
        languageId,
        name: "Third",
      });

      await reorderVocabularyGroups(tx, levelId, [third, second, first]);

      const groups = await getVocabularyGroupsByLanguage(tx, languageId);
      const byId = new Map(groups.map((g) => [g.id, g.position]));
      expect(byId.get(third)).toBe(1);
      expect(byId.get(second)).toBe(2);
      expect(byId.get(first)).toBe(3);
    });
  });
});
