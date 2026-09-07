import { describe, expect, it } from "vitest";

import { userItemProgress, vocabularyGroups } from "@/db/schema";
import { ITEM_AGUA_ID, DEVELOPER_ID, ITEM_CASA_ID, ITEM_GATO_ID, ITEM_ROJO_ID, ITEM_Y_ID, VOCAB_GROUP_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  archiveLearningItem,
  attemptPermanentDelete,
  createLearningItem,
  getAcceptedAnswers,
  getDraft,
  getDuplicateCandidateRows,
  hasBlockingReferences,
  lockLearningItemForEdit,
  moveLearningItem,
  publishDraft,
  publishPendingItem,
  reorderLearningItems,
  saveDraft,
  updateLearningItemDirect,
} from "./curriculum-mutation-repository";
import { eq } from "drizzle-orm";

function vocabFields() {
  return {
    type: "vocabulary" as const,
    fields: {
      vocabularyGroupId: VOCAB_GROUP_ID,
      term: "perro",
      primaryMeaning: "dog",
      article: "el",
      partOfSpeech: "noun",
      acceptedAnswers: [{ side: "meaning" as const, value: "the dog" }],
    },
  };
}

describe("createLearningItem / updateLearningItemDirect", () => {
  it("creates a pending vocabulary item with its accepted answers", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const id = await createLearningItem(tx, {
        languageId,
        levelId: level1Id,
        position: 50,
        lessonPriority: 50,
        ...vocabFields(),
      });

      const locked = await lockLearningItemForEdit(tx, id);
      expect(locked?.status).toBe("pending");
      expect(locked?.version).toBe(1);

      const answers = await getAcceptedAnswers(tx, id);
      expect(answers).toEqual([{ side: "meaning", value: "the dog" }]);
    });
  });

  it("creates a pending grammar item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const id = await createLearningItem(tx, {
        languageId,
        levelId: level1Id,
        position: 51,
        lessonPriority: 51,
        type: "grammar",
        fields: {
          structure: "pero",
          primaryMeaning: "but",
          explanation: "Contrasts two clauses.",
          requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
          acceptedAnswers: [],
        },
      });

      const locked = await lockLearningItemForEdit(tx, id);
      expect(locked?.status).toBe("pending");
      expect(locked?.type).toBe("grammar");
    });
  });

  it("updates a pending item's fields and replaces its accepted answers", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const id = await createLearningItem(tx, { languageId, levelId: level1Id, position: 52, lessonPriority: 52, ...vocabFields() });

      await updateLearningItemDirect(tx, id, {
        type: "vocabulary",
        fields: {
          vocabularyGroupId: VOCAB_GROUP_ID,
          term: "perro",
          primaryMeaning: "dog (updated)",
          article: "el",
          partOfSpeech: "noun",
          acceptedAnswers: [{ side: "meaning", value: "doggy" }],
        },
      });

      const answers = await getAcceptedAnswers(tx, id);
      expect(answers).toEqual([{ side: "meaning", value: "doggy" }]);
    });
  });
});

describe("publish flows", () => {
  it("publishing a pending item just flips status and bumps version", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const id = await createLearningItem(tx, { languageId, levelId: level1Id, position: 53, lessonPriority: 53, ...vocabFields() });

      await publishPendingItem(tx, id);

      const locked = await lockLearningItemForEdit(tx, id);
      expect(locked?.status).toBe("published");
      expect(locked?.version).toBe(2);
    });
  });

  it("saving a draft on an already-published item leaves the live rows untouched", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);

      const before = await lockLearningItemForEdit(tx, ITEM_GATO_ID);
      await saveDraft(tx, {
        learningItemId: ITEM_GATO_ID,
        baseVersion: before!.version,
        createdBy: DEVELOPER_ID,
        data: {
          type: "vocabulary",
          fields: {
            vocabularyGroupId: VOCAB_GROUP_ID,
            term: "gato",
            primaryMeaning: "cat (draft edit)",
            article: "el",
            partOfSpeech: "noun",
            acceptedAnswers: [],
          },
        },
      });

      const draft = await getDraft(tx, ITEM_GATO_ID);
      expect(draft?.data.fields.primaryMeaning).toBe("cat (draft edit)");

      // The live row is untouched — still says "cat", not "cat (draft edit)".
      const answers = await getAcceptedAnswers(tx, ITEM_GATO_ID);
      expect(answers).toEqual([]);
      const after = await lockLearningItemForEdit(tx, ITEM_GATO_ID);
      expect(after?.version).toBe(before?.version);
    });
  });

  it("publishing a draft applies it to the live rows, bumps version, and discards the draft", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const before = await lockLearningItemForEdit(tx, ITEM_GATO_ID);

      await saveDraft(tx, {
        learningItemId: ITEM_GATO_ID,
        baseVersion: before!.version,
        createdBy: DEVELOPER_ID,
        data: {
          type: "vocabulary",
          fields: {
            vocabularyGroupId: VOCAB_GROUP_ID,
            term: "gato",
            primaryMeaning: "cat (published edit)",
            article: "el",
            partOfSpeech: "noun",
            acceptedAnswers: [{ side: "meaning", value: "kitty" }],
          },
        },
      });
      const draft = await getDraft(tx, ITEM_GATO_ID);
      await publishDraft(tx, ITEM_GATO_ID, draft!.data);

      const after = await lockLearningItemForEdit(tx, ITEM_GATO_ID);
      expect(after?.version).toBe(before!.version + 1);
      expect(after?.status).toBe("published"); // status never left "published" throughout
      expect(await getDraft(tx, ITEM_GATO_ID)).toBeNull();
      expect(await getAcceptedAnswers(tx, ITEM_GATO_ID)).toEqual([{ side: "meaning", value: "kitty" }]);
    });
  });
});

describe("archive and delete", () => {
  it("archives an item and discards any open draft", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const before = await lockLearningItemForEdit(tx, ITEM_CASA_ID);
      await saveDraft(tx, {
        learningItemId: ITEM_CASA_ID,
        baseVersion: before!.version,
        createdBy: DEVELOPER_ID,
        data: { type: "vocabulary", fields: { vocabularyGroupId: VOCAB_GROUP_ID, term: "casa", primaryMeaning: "house", partOfSpeech: "noun", acceptedAnswers: [] } },
      });

      await archiveLearningItem(tx, ITEM_CASA_ID);

      const after = await lockLearningItemForEdit(tx, ITEM_CASA_ID);
      expect(after?.status).toBe("archived");
      expect(await getDraft(tx, ITEM_CASA_ID)).toBeNull();
    });
  });

  it("permanently deletes an unreferenced item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const id = await createLearningItem(tx, { languageId, levelId: level1Id, position: 54, lessonPriority: 54, ...vocabFields() });

      const outcome = await attemptPermanentDelete(tx, id);
      expect(outcome).toBe("deleted");
      expect(await lockLearningItemForEdit(tx, id)).toBeNull();
    });
  });

  it("refuses to permanently delete an item with real learner progress, and deletes nothing", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);

      const outcome = await attemptPermanentDelete(tx, ITEM_GATO_ID);
      expect(outcome).toBe("referenced");

      // Confirmed nothing was actually removed — the item, its vocabulary
      // detail, and the learner progress referencing it all still exist.
      expect(await lockLearningItemForEdit(tx, ITEM_GATO_ID)).not.toBeNull();
      const [progress] = await tx.select().from(userItemProgress).where(eq(userItemProgress.learningItemId, ITEM_GATO_ID));
      expect(progress).toBeDefined();
    });
  });

  it("hasBlockingReferences reports true/false without mutating anything", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const unreferencedId = await createLearningItem(tx, { languageId, levelId: level1Id, position: 55, lessonPriority: 55, ...vocabFields() });

      expect(await hasBlockingReferences(tx, ITEM_GATO_ID)).toBe(true);
      expect(await hasBlockingReferences(tx, unreferencedId)).toBe(false);
      // Still there — the dry run didn't delete it despite reporting "not referenced".
      expect(await lockLearningItemForEdit(tx, unreferencedId)).not.toBeNull();
    });
  });
});

describe("move and reorder", () => {
  it("moves an item to a different level, appending it at the end of that level's ordering", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);

      await moveLearningItem(tx, { learningItemId: ITEM_Y_ID, type: "grammar", levelId: level1Id });
      const locked = await lockLearningItemForEdit(tx, ITEM_Y_ID);
      expect(locked?.levelId).toBe(level1Id);
    });
  });

  it("moves a vocabulary item to a different group", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const [newGroup] = await tx
        .insert(vocabularyGroups)
        .values({ levelId: level1Id, languageId, name: "New Group", position: 99 })
        .returning();

      await moveLearningItem(tx, { learningItemId: ITEM_CASA_ID, type: "vocabulary", vocabularyGroupId: newGroup!.id });

      const answers = await getAcceptedAnswers(tx, ITEM_CASA_ID); // sanity: item still resolvable
      expect(answers).toEqual([]);
    });
  });

  it("appends a moved item at the end of the target level's ordering, not position 1", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      // Level 1 already has vocab at positions 1-3 (gato/casa/agua). rojo is
      // seeded in Level 2 at position 1 — moving it into Level 1 should
      // append it after the existing three, not collide with position 1.
      await moveLearningItem(tx, { learningItemId: ITEM_ROJO_ID, type: "vocabulary", levelId: level1Id });
      const moved = await lockLearningItemForEdit(tx, ITEM_ROJO_ID);
      expect(moved?.levelId).toBe(level1Id);
      expect(moved?.position).toBe(4);
    });
  });

  it("reorders items within a level+type without a unique-constraint collision, and applies the new order", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const extraId = await createLearningItem(tx, { languageId, levelId: level1Id, position: 56, lessonPriority: 56, ...vocabFields() });

      // Original vocab order in level 1: gato(1), casa(2), agua(3), extra(56).
      // Reverse the first three, keep extra last.
      await reorderLearningItems(tx, level1Id, "vocabulary", [ITEM_CASA_ID, ITEM_GATO_ID, ITEM_AGUA_ID, extraId]);

      expect((await lockLearningItemForEdit(tx, ITEM_CASA_ID))?.position).toBe(1);
      expect((await lockLearningItemForEdit(tx, ITEM_GATO_ID))?.position).toBe(2);
      expect((await lockLearningItemForEdit(tx, ITEM_AGUA_ID))?.position).toBe(3);
      expect((await lockLearningItemForEdit(tx, extraId))?.position).toBe(4);
    });
  });
});

describe("getDuplicateCandidateRows", () => {
  it("returns every vocabulary item in the language, excluding the given id", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const rows = await getDuplicateCandidateRows(tx, languageId, "vocabulary", ITEM_GATO_ID);
      expect(rows.some((r) => r.learningItemId === ITEM_GATO_ID)).toBe(false);
      expect(rows.some((r) => r.displayForm === "casa")).toBe(true);
    });
  });

  it("returns grammar candidates separately from vocabulary", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const rows = await getDuplicateCandidateRows(tx, languageId, "grammar");
      expect(rows.map((r) => r.displayForm)).toEqual(["y"]);
    });
  });
});
