import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  grammarItems,
  languages,
  learningItems,
  learningItemSentences,
  levels,
  sentences,
  userItemProgress,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getDefaultLanguageCode } from "@/domains/users";

import { getLanguageByCode, getLearningItem, getLevelById, getLevelItems, getVocabularyGroup } from "./curriculum-repository";

describe("curriculum repository", () => {
  it("resolves the language by code and returns a domain projection, not a raw row", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const language = await getLanguageByCode(tx, getDefaultLanguageCode());

      expect(language?.id).toBe(languageId);
      expect(language?.code).toBe(getDefaultLanguageCode());
      expect(language?.slug).toBe("spanish");
      // A domain projection, not the Drizzle row: no createdAt/updatedAt leak through.
      expect(language).not.toHaveProperty("createdAt");
    });
  });

  it("enforces language code uniqueness", async () => {
    await withTestTransaction(async (tx) => {
      await tx.insert(languages).values({ code: "dup-lang", slug: "dup-lang-a", name: "Duplicate A" });
      await expect(
        tx.insert(languages).values({ code: "dup-lang", slug: "dup-lang-b", name: "Duplicate B" }),
      ).rejects.toThrow();
    });
  });

  it("enforces level uniqueness within a language", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await expect(
        tx.insert(levels).values({ languageId, levelNumber: 1, name: "Duplicate Level 1" }),
      ).rejects.toThrow();
    });
  });

  it("returns a level by ID as a domain projection", async () => {
    await withTestTransaction(async (tx) => {
      // Level 2, not Level 1: Level 1 for the default language/level-number
      // combination was already committed by spec 08 unit 3's concurrency
      // test without a status (defaults to "draft") — see
      // db/seed/test-fixtures.ts's module docstring. Level 2 is exclusively
      // this fixture's own row, so its status is reliably what was seeded.
      const { level2Id, languageId } = await seedTestFixtures(tx);
      const level = await getLevelById(tx, level2Id);

      expect(level?.id).toBe(level2Id);
      expect(level?.languageId).toBe(languageId);
      expect(level?.levelNumber).toBe(2);
      expect(level?.status).toBe("published");
    });
  });

  it("returns a vocabulary group by ID", async () => {
    await withTestTransaction(async (tx) => {
      const { vocabGroupId, level1Id } = await seedTestFixtures(tx);
      const group = await getVocabularyGroup(tx, vocabGroupId);

      expect(group?.id).toBe(vocabGroupId);
      expect(group?.levelId).toBe(level1Id);
      expect(group?.position).toBe(1);
    });
  });

  it("enforces vocabulary group ordering (position) uniqueness within a level", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id, languageId } = await seedTestFixtures(tx);
      await expect(
        tx.insert(vocabularyGroups).values({ levelId: level1Id, languageId, name: "Another Group", position: 1 }),
      ).rejects.toThrow();
    });
  });

  it("returns a vocabulary learning item with its vocabulary detail joined", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, vocabGroupId } = await seedTestFixtures(tx);
      const item = await getLearningItem(tx, gatoId);

      expect(item?.type).toBe("vocabulary");
      if (item?.type === "vocabulary") {
        expect(item.vocabulary.term).toBe("gato");
        expect(item.vocabulary.article).toBe("el");
        expect(item.vocabulary.vocabularyGroupId).toBe(vocabGroupId);
      }
    });
  });

  it("returns a grammar learning item with its grammar detail joined", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      const item = await getLearningItem(tx, grammarYId);

      expect(item?.type).toBe("grammar");
      if (item?.type === "grammar") {
        expect(item.grammar.structure).toBe("y");
        expect(item.grammar.primaryMeaning).toBe("and");
      }
    });
  });

  it("enforces vocabulary one-to-one identity — a second vocabulary_items row for the same learning item is rejected", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, vocabGroupId } = await seedTestFixtures(tx);
      await expect(
        tx.insert(vocabularyItems).values({
          learningItemId: gatoId,
          vocabularyGroupId: vocabGroupId,
          term: "gato-duplicate",
          primaryMeaning: "cat",
          partOfSpeech: "noun",
        }),
      ).rejects.toThrow();
    });
  });

  it("enforces grammar one-to-one identity — a second grammar_items row for the same learning item is rejected", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      await expect(
        tx.insert(grammarItems).values({
          learningItemId: grammarYId,
          structure: "y-duplicate",
          primaryMeaning: "and",
          explanation: "duplicate",
        }),
      ).rejects.toThrow();
    });
  });

  it("returns every item in a level via getLevelItems, ordered by position", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id, gatoId, casaId, aguaId, grammarYId } = await seedTestFixtures(tx);
      const items = await getLevelItems(tx, level1Id);

      expect(items.map((item) => item.id)).toEqual([gatoId, casaId, aguaId, grammarYId]);
    });
  });

  it("resolves a supporting sentence relationship for a learning item", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);
      const rows = await tx
        .select({ targetText: sentences.targetText })
        .from(learningItemSentences)
        .innerJoin(sentences, eq(sentences.id, learningItemSentences.sentenceId))
        .where(eq(learningItemSentences.learningItemId, gatoId));

      expect(rows).toEqual([{ targetText: "El gato duerme." }]);
    });
  });

  it("stores and returns archived status", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id, languageId, vocabGroupId } = await seedTestFixtures(tx);
      const [archivedItem] = await tx
        .insert(learningItems)
        .values({
          languageId,
          levelId: level1Id,
          type: "vocabulary",
          status: "archived",
          position: 99,
          lessonPriority: 99,
        })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: archivedItem.id,
        vocabularyGroupId: vocabGroupId,
        term: "archived-term",
        primaryMeaning: "archived meaning",
        partOfSpeech: "noun",
      });

      const item = await getLearningItem(tx, archivedItem.id);
      expect(item?.status).toBe("archived");
    });
  });

  it("keeps a learning item's identity (id) stable across an ordinary content update", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId } = await seedTestFixtures(tx);
      await tx.update(vocabularyItems).set({ definition: "Updated definition" }).where(eq(vocabularyItems.learningItemId, gatoId));

      const item = await getLearningItem(tx, gatoId);
      expect(item?.id).toBe(gatoId);
      if (item?.type === "vocabulary") {
        expect(item.vocabulary.definition).toBe("Updated definition");
        expect(item.vocabulary.term).toBe("gato");
      }
    });
  });

  it("rejects a cross-language learning item via the composite foreign key", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      const [otherLanguage] = await tx
        .insert(languages)
        .values({ code: "other-lang", slug: "other-lang", name: "Other" })
        .returning();

      // level1Id belongs to the default language, not otherLanguage — the
      // composite FK (learning_items -> levels on (level_id, language_id))
      // must reject this regardless of level1Id being a real level.
      await expect(
        tx.insert(learningItems).values({
          languageId: otherLanguage.id,
          levelId: level1Id,
          type: "vocabulary",
          status: "draft",
          position: 1,
          lessonPriority: 1,
        }),
      ).rejects.toThrow();
    });
  });

  it("rejects deleting a learning item referenced by progress", async () => {
    await withTestTransaction(async (tx) => {
      const { gatoId, learnerId } = await seedTestFixtures(tx);
      // seedTestFixtures already creates a userItemProgress row for
      // (learnerId, gatoId) — confirm the delete is rejected because of it.
      const existing = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      expect(existing).toHaveLength(1);

      await expect(tx.delete(learningItems).where(eq(learningItems.id, gatoId))).rejects.toThrow();
    });
  });
});
