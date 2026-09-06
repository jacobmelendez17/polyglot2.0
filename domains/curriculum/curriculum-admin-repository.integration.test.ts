import { describe, expect, it } from "vitest";

import { languages, learningItems, levels, vocabularyItems } from "@/db/schema";
import {
  ITEM_AGUA_ID,
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  ITEM_ROJO_ID,
  ITEM_Y_ID,
  VOCAB_GROUP_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getAdminCurriculumItems, getAdminCurriculumStatusCounts } from "./curriculum-admin-repository";

describe("getAdminCurriculumItems", () => {
  it("lists every item for a language, ordered by level then curriculum position", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const page = await getAdminCurriculumItems(tx, { languageId, limit: 10 });

      expect(page.items.map((i) => i.id)).toEqual([ITEM_GATO_ID, ITEM_CASA_ID, ITEM_AGUA_ID, ITEM_Y_ID, ITEM_ROJO_ID]);
      expect(page.nextCursor).toBeNull();

      const gato = page.items[0]!;
      expect(gato.itemLabel).toBe("el gato");
      expect(gato.meaningLabel).toBe("cat");
      expect(gato.groupId).toBe(VOCAB_GROUP_ID);
      expect(gato.groupName).toBe("Home & Basics");
      expect(gato.levelNumber).toBe(1);

      const grammarY = page.items.find((i) => i.id === ITEM_Y_ID)!;
      expect(grammarY.itemLabel).toBe("y");
      expect(grammarY.meaningLabel).toBe("and");
      expect(grammarY.groupId).toBeNull();
      expect(grammarY.groupName).toBeNull();
    });
  });

  it("filters by level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const page = await getAdminCurriculumItems(tx, { languageId, levelId: level1Id, limit: 10 });

      expect(page.items.map((i) => i.id).sort()).toEqual(
        [ITEM_GATO_ID, ITEM_CASA_ID, ITEM_AGUA_ID, ITEM_Y_ID].sort(),
      );
      expect(page.items.some((i) => i.id === ITEM_ROJO_ID)).toBe(false);
    });
  });

  it("filters by item type", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const vocab = await getAdminCurriculumItems(tx, { languageId, type: "vocabulary", limit: 10 });
      expect(vocab.items.every((i) => i.type === "vocabulary")).toBe(true);
      expect(vocab.items.some((i) => i.id === ITEM_Y_ID)).toBe(false);

      const grammar = await getAdminCurriculumItems(tx, { languageId, type: "grammar", limit: 10 });
      expect(grammar.items.map((i) => i.id)).toEqual([ITEM_Y_ID]);
    });
  });

  it("filters by group", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const page = await getAdminCurriculumItems(tx, { languageId, groupId: VOCAB_GROUP_ID, limit: 10 });
      expect(page.items.map((i) => i.id).sort()).toEqual(
        [ITEM_GATO_ID, ITEM_CASA_ID, ITEM_AGUA_ID, ITEM_ROJO_ID].sort(),
      );
      // Grammar items have no group at all — never match a group filter.
      expect(page.items.some((i) => i.id === ITEM_Y_ID)).toBe(false);
    });
  });

  it("filters by status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      // Every seeded fixture item is "published" — insert one throwaway
      // "draft" item scoped to this test to prove status filtering works,
      // rather than only ever exercising a single-status fixture.
      const [draftItem] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "draft", position: 99, lessonPriority: 99 })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: draftItem!.id,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "perro",
        primaryMeaning: "dog",
        article: "el",
        partOfSpeech: "noun",
      });

      const published = await getAdminCurriculumItems(tx, { languageId, status: "published", limit: 10 });
      expect(published.items.some((i) => i.id === draftItem!.id)).toBe(false);

      const draft = await getAdminCurriculumItems(tx, { languageId, status: "draft", limit: 10 });
      expect(draft.items.map((i) => i.id)).toEqual([draftItem!.id]);
    });
  });

  it("searches by term, by meaning, and by the article-composed form, without matching an unrelated term", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const byTerm = await getAdminCurriculumItems(tx, { languageId, search: "gato", limit: 10 });
      expect(byTerm.items.map((i) => i.id)).toEqual([ITEM_GATO_ID]);

      const byMeaning = await getAdminCurriculumItems(tx, { languageId, search: "cat", limit: 10 });
      expect(byMeaning.items.map((i) => i.id)).toEqual([ITEM_GATO_ID]);

      const byComposedForm = await getAdminCurriculumItems(tx, { languageId, search: "el gato", limit: 10 });
      expect(byComposedForm.items.map((i) => i.id)).toEqual([ITEM_GATO_ID]);

      const byGrammarExplanation = await getAdminCurriculumItems(tx, { languageId, search: "clauses", limit: 10 });
      expect(byGrammarExplanation.items.map((i) => i.id)).toEqual([ITEM_Y_ID]);

      const noMatch = await getAdminCurriculumItems(tx, { languageId, search: "xyzzy", limit: 10 });
      expect(noMatch.items).toHaveLength(0);
    });
  });

  it("is case-insensitive but accent-preserving — never conflates 'si' and 'sí'", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const [siItem] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 98, lessonPriority: 98 })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: siItem!.id,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "sí",
        primaryMeaning: "yes",
        partOfSpeech: "adverb",
      });

      const accented = await getAdminCurriculumItems(tx, { languageId, search: "sí", limit: 10 });
      expect(accented.items.map((i) => i.id)).toContain(siItem!.id);

      const plain = await getAdminCurriculumItems(tx, { languageId, search: "si", limit: 10 });
      expect(plain.items.map((i) => i.id)).not.toContain(siItem!.id);

      const caseInsensitive = await getAdminCurriculumItems(tx, { languageId, search: "GATO", limit: 10 });
      expect(caseInsensitive.items.map((i) => i.id)).toEqual([ITEM_GATO_ID]);
    });
  });

  it("paginates via keyset cursor without gaps or duplicates", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const expectedIds = [ITEM_GATO_ID, ITEM_CASA_ID, ITEM_AGUA_ID, ITEM_Y_ID, ITEM_ROJO_ID];

      const firstPage = await getAdminCurriculumItems(tx, { languageId, limit: 2 });
      expect(firstPage.items.map((i) => i.id)).toEqual(expectedIds.slice(0, 2));
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await getAdminCurriculumItems(tx, { languageId, limit: 2, cursor: firstPage.nextCursor });
      expect(secondPage.items.map((i) => i.id)).toEqual(expectedIds.slice(2, 4));

      const thirdPage = await getAdminCurriculumItems(tx, { languageId, limit: 2, cursor: secondPage.nextCursor });
      expect(thirdPage.items.map((i) => i.id)).toEqual(expectedIds.slice(4, 5));
      expect(thirdPage.nextCursor).toBeNull();
    });
  });

  it("never leaks another language's items into the listing", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const [otherLanguage] = await tx
        .insert(languages)
        .values({ code: "fixture-other", slug: "fixture-other", name: "Other Fixture Language" })
        .returning();
      const [otherLevel] = await tx
        .insert(levels)
        .values({ languageId: otherLanguage!.id, levelNumber: 1, status: "published" })
        .returning();
      const [otherItem] = await tx
        .insert(learningItems)
        .values({ languageId: otherLanguage!.id, levelId: otherLevel!.id, type: "vocabulary", status: "published", position: 1, lessonPriority: 1 })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: otherItem!.id,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "gato",
        primaryMeaning: "cat",
        partOfSpeech: "noun",
      });

      const page = await getAdminCurriculumItems(tx, { languageId, search: "gato", limit: 10 });
      expect(page.items.map((i) => i.id)).toEqual([ITEM_GATO_ID]);
      expect(page.items.some((i) => i.id === otherItem!.id)).toBe(false);
    });
  });
});

describe("getAdminCurriculumStatusCounts", () => {
  it("tallies items per status for one language", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const [draftItem] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "draft", position: 97, lessonPriority: 97 })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: draftItem!.id,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "azul",
        primaryMeaning: "blue",
        partOfSpeech: "adjective",
      });

      const counts = await getAdminCurriculumStatusCounts(tx, languageId);
      expect(counts.published).toBe(5); // gato, casa, agua, y, rojo
      expect(counts.draft).toBe(1);
      expect(counts.pending).toBe(0);
      expect(counts.archived).toBe(0);
    });
  });
});
