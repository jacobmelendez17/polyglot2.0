import { describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  acceptedAnswers,
  grammarItems,
  languages,
  learningItemSentences,
  learningItems,
  levels,
  sentences,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { DEVELOPER_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { updateItem } from "@/domains/admin/publication-service";

import {
  getAdjacentAdminCurriculumItem,
  getAdminCurriculumItems,
  getAdminCurriculumStatusCounts,
  getLevelContentSummary,
} from "./curriculum-admin-repository";

/**
 * Every test here asks a **language-wide** question — "list every item",
 * "tally each status", "page through all of them" — so it can only assert an
 * exact answer if it owns every row in that language.
 *
 * It cannot own the seeded fixture language: `TEST_DATABASE_URL` and
 * `DATABASE_URL` point at the same database (see progress-tracker.md's
 * Environment Notes), and that language now holds the real, imported Level 1
 * curriculum. Asserting "the listing is exactly these five items" there
 * stopped being a statement about this repository and became a statement
 * about how much curriculum happens to exist.
 *
 * So each test seeds a throwaway language of its own — the same technique the
 * "never leaks another language's items" test already used — and gets exact
 * assertions back. The transaction rolls it all back.
 */

type IsolatedCurriculum = {
  languageId: string;
  level1Id: string;
  level2Id: string;
  groupId: string;
  gatoId: string;
  casaId: string;
  aguaId: string;
  grammarYId: string;
  rojoId: string;
};

async function seedIsolatedCurriculum(
  tx: DbClient,
): Promise<IsolatedCurriculum> {
  // The audit-recording paths below reference a real actor row.
  await seedTestFixtures(tx);

  const unique = crypto.randomUUID();
  const [language] = await tx
    .insert(languages)
    .values({
      code: `fixture-admin-${unique}`,
      slug: `fixture-admin-${unique}`,
      name: "Admin Listing Fixture",
    })
    .returning();
  const languageId = language!.id;

  const [level1] = await tx
    .insert(levels)
    .values({
      languageId,
      levelNumber: 1,
      name: "Level 1",
      status: "published",
    })
    .returning();
  const [level2] = await tx
    .insert(levels)
    .values({
      languageId,
      levelNumber: 2,
      name: "Level 2",
      status: "published",
    })
    .returning();
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({
      levelId: level1!.id,
      languageId,
      name: "Home & Basics",
      position: 1,
      status: "published",
    })
    .returning();

  const inserted = await tx
    .insert(learningItems)
    .values([
      {
        languageId,
        levelId: level1!.id,
        type: "vocabulary",
        status: "published",
        position: 1,
        lessonPriority: 1,
      },
      {
        languageId,
        levelId: level1!.id,
        type: "vocabulary",
        status: "published",
        position: 2,
        lessonPriority: 2,
      },
      {
        languageId,
        levelId: level1!.id,
        type: "vocabulary",
        status: "published",
        position: 3,
        lessonPriority: 3,
      },
      {
        languageId,
        levelId: level1!.id,
        type: "grammar",
        status: "published",
        position: 4,
        lessonPriority: 4,
      },
      {
        languageId,
        levelId: level2!.id,
        type: "vocabulary",
        status: "published",
        position: 1,
        lessonPriority: 1,
      },
    ])
    .returning({ id: learningItems.id });
  const [gatoId, casaId, aguaId, grammarYId, rojoId] = inserted.map(
    (row) => row.id,
  );

  await tx.insert(vocabularyItems).values([
    {
      learningItemId: gatoId!,
      vocabularyGroupId: group!.id,
      term: "gato",
      primaryMeaning: "cat",
      article: "el",
      partOfSpeech: "noun",
    },
    {
      learningItemId: casaId!,
      vocabularyGroupId: group!.id,
      term: "casa",
      primaryMeaning: "house",
      article: "la",
      partOfSpeech: "noun",
    },
    {
      learningItemId: aguaId!,
      vocabularyGroupId: group!.id,
      term: "agua",
      primaryMeaning: "water",
      article: "el",
      partOfSpeech: "noun",
    },
    {
      learningItemId: rojoId!,
      vocabularyGroupId: group!.id,
      term: "rojo",
      primaryMeaning: "red",
      partOfSpeech: "adjective",
    },
  ]);
  await tx.insert(grammarItems).values({
    learningItemId: grammarYId!,
    structure: "y",
    primaryMeaning: "and",
    explanation: "Connects two words, phrases, or clauses.",
    requiredQuestions: [
      { format: "translation", direction: "targetToEnglish" },
    ],
  });

  return {
    languageId,
    level1Id: level1!.id,
    level2Id: level2!.id,
    groupId: group!.id,
    gatoId: gatoId!,
    casaId: casaId!,
    aguaId: aguaId!,
    grammarYId: grammarYId!,
    rojoId: rojoId!,
  };
}

describe("getAdminCurriculumItems", () => {
  it("lists every item for a language, ordered by level then curriculum position", async () => {
    await withTestTransaction(async (tx) => {
      const {
        languageId,
        groupId,
        gatoId,
        casaId,
        aguaId,
        grammarYId,
        rojoId,
      } = await seedIsolatedCurriculum(tx);

      const page = await getAdminCurriculumItems(tx, { languageId, limit: 10 });

      expect(page.items.map((i) => i.id)).toEqual([
        gatoId,
        casaId,
        aguaId,
        grammarYId,
        rojoId,
      ]);
      expect(page.nextCursor).toBeNull();

      const gato = page.items[0]!;
      expect(gato.itemLabel).toBe("el gato");
      expect(gato.meaningLabel).toBe("cat");
      expect(gato.groupId).toBe(groupId);
      expect(gato.groupName).toBe("Home & Basics");
      expect(gato.levelNumber).toBe(1);

      const grammarY = page.items.find((i) => i.id === grammarYId)!;
      expect(grammarY.itemLabel).toBe("y");
      expect(grammarY.meaningLabel).toBe("and");
      expect(grammarY.groupId).toBeNull();
      expect(grammarY.groupName).toBeNull();
    });
  });

  it("filters by level", async () => {
    await withTestTransaction(async (tx) => {
      const {
        languageId,
        level1Id,
        gatoId,
        casaId,
        aguaId,
        grammarYId,
        rojoId,
      } = await seedIsolatedCurriculum(tx);

      const page = await getAdminCurriculumItems(tx, {
        languageId,
        levelId: level1Id,
        limit: 10,
      });

      expect(page.items.map((i) => i.id).sort()).toEqual(
        [gatoId, casaId, aguaId, grammarYId].sort(),
      );
      expect(page.items.some((i) => i.id === rojoId)).toBe(false);
    });
  });

  it("filters by item type", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, grammarYId } = await seedIsolatedCurriculum(tx);

      const vocab = await getAdminCurriculumItems(tx, {
        languageId,
        type: "vocabulary",
        limit: 10,
      });
      expect(vocab.items.every((i) => i.type === "vocabulary")).toBe(true);
      expect(vocab.items.some((i) => i.id === grammarYId)).toBe(false);

      const grammar = await getAdminCurriculumItems(tx, {
        languageId,
        type: "grammar",
        limit: 10,
      });
      expect(grammar.items.map((i) => i.id)).toEqual([grammarYId]);
    });
  });

  it("filters by group", async () => {
    await withTestTransaction(async (tx) => {
      const {
        languageId,
        groupId,
        gatoId,
        casaId,
        aguaId,
        grammarYId,
        rojoId,
      } = await seedIsolatedCurriculum(tx);

      const page = await getAdminCurriculumItems(tx, {
        languageId,
        groupId,
        limit: 10,
      });
      expect(page.items.map((i) => i.id).sort()).toEqual(
        [gatoId, casaId, aguaId, rojoId].sort(),
      );
      // Grammar items have no group at all — never match a group filter.
      expect(page.items.some((i) => i.id === grammarYId)).toBe(false);
    });
  });

  it("filters by status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, groupId } =
        await seedIsolatedCurriculum(tx);

      // Every seeded item is "published" — insert one throwaway "pending"
      // item to prove status filtering works, rather than only ever
      // exercising a single-status fixture. Not "draft": that status never
      // appears literally in `learning_items` (see its column comment) — a
      // published item with an open edit is covered separately, by "shows
      // 'draft' for a published item..." below.
      const [pendingItem] = await tx
        .insert(learningItems)
        .values({
          languageId,
          levelId: level1Id,
          type: "vocabulary",
          status: "pending",
          position: 99,
          lessonPriority: 99,
        })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: pendingItem!.id,
        vocabularyGroupId: groupId,
        term: "perro",
        primaryMeaning: "dog",
        article: "el",
        partOfSpeech: "noun",
      });

      const published = await getAdminCurriculumItems(tx, {
        languageId,
        status: "published",
        limit: 10,
      });
      expect(published.items.some((i) => i.id === pendingItem!.id)).toBe(false);

      const pending = await getAdminCurriculumItems(tx, {
        languageId,
        status: "pending",
        limit: 10,
      });
      expect(pending.items.map((i) => i.id)).toEqual([pendingItem!.id]);
    });
  });

  it("searches by term, by meaning, and by the article-composed form, without matching an unrelated term", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, gatoId, grammarYId } =
        await seedIsolatedCurriculum(tx);

      const byTerm = await getAdminCurriculumItems(tx, {
        languageId,
        search: "gato",
        limit: 10,
      });
      expect(byTerm.items.map((i) => i.id)).toEqual([gatoId]);

      const byMeaning = await getAdminCurriculumItems(tx, {
        languageId,
        search: "cat",
        limit: 10,
      });
      expect(byMeaning.items.map((i) => i.id)).toEqual([gatoId]);

      const byComposedForm = await getAdminCurriculumItems(tx, {
        languageId,
        search: "el gato",
        limit: 10,
      });
      expect(byComposedForm.items.map((i) => i.id)).toEqual([gatoId]);

      const byGrammarExplanation = await getAdminCurriculumItems(tx, {
        languageId,
        search: "clauses",
        limit: 10,
      });
      expect(byGrammarExplanation.items.map((i) => i.id)).toEqual([grammarYId]);

      const noMatch = await getAdminCurriculumItems(tx, {
        languageId,
        search: "xyzzy",
        limit: 10,
      });
      expect(noMatch.items).toHaveLength(0);
    });
  });

  it("is case-insensitive but accent-preserving — never conflates 'si' and 'sí'", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, groupId, gatoId } =
        await seedIsolatedCurriculum(tx);

      const [siItem] = await tx
        .insert(learningItems)
        .values({
          languageId,
          levelId: level1Id,
          type: "vocabulary",
          status: "published",
          position: 98,
          lessonPriority: 98,
        })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: siItem!.id,
        vocabularyGroupId: groupId,
        term: "sí",
        primaryMeaning: "yes",
        partOfSpeech: "adverb",
      });

      const accented = await getAdminCurriculumItems(tx, {
        languageId,
        search: "sí",
        limit: 10,
      });
      expect(accented.items.map((i) => i.id)).toContain(siItem!.id);

      const plain = await getAdminCurriculumItems(tx, {
        languageId,
        search: "si",
        limit: 10,
      });
      expect(plain.items.map((i) => i.id)).not.toContain(siItem!.id);

      const caseInsensitive = await getAdminCurriculumItems(tx, {
        languageId,
        search: "GATO",
        limit: 10,
      });
      expect(caseInsensitive.items.map((i) => i.id)).toEqual([gatoId]);
    });
  });

  it("paginates via keyset cursor without gaps or duplicates", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, gatoId, casaId, aguaId, grammarYId, rojoId } =
        await seedIsolatedCurriculum(tx);
      const expectedIds = [gatoId, casaId, aguaId, grammarYId, rojoId];

      const firstPage = await getAdminCurriculumItems(tx, {
        languageId,
        limit: 2,
      });
      expect(firstPage.items.map((i) => i.id)).toEqual(expectedIds.slice(0, 2));
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await getAdminCurriculumItems(tx, {
        languageId,
        limit: 2,
        cursor: firstPage.nextCursor,
      });
      expect(secondPage.items.map((i) => i.id)).toEqual(
        expectedIds.slice(2, 4),
      );

      const thirdPage = await getAdminCurriculumItems(tx, {
        languageId,
        limit: 2,
        cursor: secondPage.nextCursor,
      });
      expect(thirdPage.items.map((i) => i.id)).toEqual(expectedIds.slice(4, 5));
      expect(thirdPage.nextCursor).toBeNull();
    });
  });

  it("never leaks another language's items into the listing", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, groupId, gatoId } = await seedIsolatedCurriculum(tx);

      const unique = crypto.randomUUID();
      const [otherLanguage] = await tx
        .insert(languages)
        .values({
          code: `fixture-other-${unique}`,
          slug: `fixture-other-${unique}`,
          name: "Other Fixture Language",
        })
        .returning();
      const [otherLevel] = await tx
        .insert(levels)
        .values({
          languageId: otherLanguage!.id,
          levelNumber: 1,
          status: "published",
        })
        .returning();
      const [otherItem] = await tx
        .insert(learningItems)
        .values({
          languageId: otherLanguage!.id,
          levelId: otherLevel!.id,
          type: "vocabulary",
          status: "published",
          position: 1,
          lessonPriority: 1,
        })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: otherItem!.id,
        vocabularyGroupId: groupId,
        term: "gato",
        primaryMeaning: "cat",
        partOfSpeech: "noun",
      });

      const page = await getAdminCurriculumItems(tx, {
        languageId,
        search: "gato",
        limit: 10,
      });
      expect(page.items.map((i) => i.id)).toEqual([gatoId]);
      expect(page.items.some((i) => i.id === otherItem!.id)).toBe(false);
    });
  });

  it("shows 'draft' for a published item with an open edit, without changing its stored status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, groupId, gatoId } = await seedIsolatedCurriculum(tx);
      await updateItem(tx, {
        learningItemId: gatoId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: groupId,
          term: "gato",
          primaryMeaning: "cat (draft)",
          article: "el",
          partOfSpeech: "noun",
          acceptedAnswers: [],
        },
      });

      const all = await getAdminCurriculumItems(tx, { languageId, limit: 10 });
      const gatoRow = all.items.find((i) => i.id === gatoId);
      expect(gatoRow?.status).toBe("draft");

      // Filtering by "draft" finds it; filtering by "published" still finds it too (it's genuinely still live).
      const draftFiltered = await getAdminCurriculumItems(tx, {
        languageId,
        status: "draft",
        limit: 10,
      });
      expect(draftFiltered.items.map((i) => i.id)).toContain(gatoId);
      const publishedFiltered = await getAdminCurriculumItems(tx, {
        languageId,
        status: "published",
        limit: 10,
      });
      expect(publishedFiltered.items.map((i) => i.id)).toContain(gatoId);
    });
  });
});

describe("getAdminCurriculumStatusCounts", () => {
  it("tallies items per status for one language", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, groupId } =
        await seedIsolatedCurriculum(tx);

      const [draftItem] = await tx
        .insert(learningItems)
        .values({
          languageId,
          levelId: level1Id,
          type: "vocabulary",
          status: "draft",
          position: 97,
          lessonPriority: 97,
        })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: draftItem!.id,
        vocabularyGroupId: groupId,
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

describe("spec 25 §15/§16 — editorial work queue", () => {
  it("needsDefinition/needsIpa/needsPronunciation/needsSynonyms/needsVariations/needsExamples are true by default, and the `needs` filter matches them", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, gatoId, casaId } = await seedIsolatedCurriculum(tx);

      const [gato] = (
        await getAdminCurriculumItems(tx, { languageId, limit: 10 })
      ).items.filter((i) => i.id === gatoId);
      expect(gato).toMatchObject({
        needsDefinition: true,
        needsExamples: true,
        needsIpa: true,
        needsPronunciation: true,
        needsSynonyms: true,
        needsVariations: true,
      });

      // Fill in casa's definition/ipa/pronunciation, an example, and one
      // synonym+variation — it should stop needing any of them, while gato
      // (untouched) still does.
      await tx
        .update(vocabularyItems)
        .set({
          definition: "a small domesticated feline",
          ipa: "/ˈka.sa/",
          pronunciation: "KAH-sah",
        })
        .where(eq(vocabularyItems.learningItemId, casaId));
      const [sentence] = await tx
        .insert(sentences)
        .values({
          languageId,
          targetText: "La casa es grande.",
          translation: "The house is big.",
        })
        .returning();
      await tx.insert(learningItemSentences).values({
        learningItemId: casaId,
        sentenceId: sentence!.id,
        position: 1,
      });
      await tx.insert(acceptedAnswers).values([
        {
          learningItemId: casaId,
          side: "meaning",
          value: "home",
          normalizedValue: "home",
        },
        {
          learningItemId: casaId,
          side: "term",
          value: "casita",
          normalizedValue: "casita",
        },
      ]);

      const page = await getAdminCurriculumItems(tx, { languageId, limit: 10 });
      const casa = page.items.find((i) => i.id === casaId)!;
      expect(casa).toMatchObject({
        needsDefinition: false,
        needsExamples: false,
        needsIpa: false,
        needsPronunciation: false,
        needsSynonyms: false,
        needsVariations: false,
      });

      for (const needs of [
        "definition",
        "examples",
        "ipa",
        "pronunciation",
        "synonyms",
        "variations",
      ] as const) {
        const filtered = await getAdminCurriculumItems(tx, {
          languageId,
          needs,
          limit: 10,
        });
        const ids = filtered.items.map((i) => i.id);
        expect(ids).toContain(gatoId);
        expect(ids).not.toContain(casaId);
      }
    });
  });

  it("a grammar item needs a definition only when its explanation is blank, and never needs IPA/pronunciation/variations", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, grammarYId } = await seedIsolatedCurriculum(tx);

      const page = await getAdminCurriculumItems(tx, { languageId, limit: 10 });
      const grammarY = page.items.find((i) => i.id === grammarYId)!;
      // The fixture's own explanation is non-blank ("Connects two words...").
      expect(grammarY.needsDefinition).toBe(false);
      expect(grammarY.needsIpa).toBe(false);
      expect(grammarY.needsPronunciation).toBe(false);
      expect(grammarY.needsVariations).toBe(false);
      expect(grammarY.needsExamples).toBe(true);
      expect(grammarY.needsSynonyms).toBe(true);

      await tx
        .update(grammarItems)
        .set({ explanation: "" })
        .where(eq(grammarItems.learningItemId, grammarYId));
      const after = (
        await getAdminCurriculumItems(tx, {
          languageId,
          needs: "definition",
          limit: 10,
        })
      ).items.map((i) => i.id);
      expect(after).toContain(grammarYId);
    });
  });

  it("needs=draft_changes matches a published item with an open draft; needs=ready_to_publish matches pending items", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, groupId, gatoId } = await seedIsolatedCurriculum(tx);

      await updateItem(tx, {
        learningItemId: gatoId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: groupId,
          term: "gato",
          primaryMeaning: "cat (edited)",
          article: "el",
          partOfSpeech: "noun",
          acceptedAnswers: [],
        },
      });

      const draftFiltered = await getAdminCurriculumItems(tx, {
        languageId,
        needs: "draft_changes",
        limit: 10,
      });
      expect(draftFiltered.items.map((i) => i.id)).toEqual([gatoId]);

      const readyFiltered = await getAdminCurriculumItems(tx, {
        languageId,
        needs: "ready_to_publish",
        limit: 10,
      });
      expect(readyFiltered.items).toEqual([]);
    });
  });
});

describe("getAdjacentAdminCurriculumItem (spec 25 §16)", () => {
  it("returns the next/previous item in the same level/position/id order getAdminCurriculumItems uses", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, gatoId, casaId, aguaId, grammarYId, rojoId } =
        await seedIsolatedCurriculum(tx);

      const next = await getAdjacentAdminCurriculumItem(tx, {
        languageId,
        currentLevelNumber: 1,
        currentPosition: 1, // gato
        currentId: gatoId,
        direction: "next",
      });
      expect(next).toEqual({ id: casaId });

      const previous = await getAdjacentAdminCurriculumItem(tx, {
        languageId,
        currentLevelNumber: 1,
        currentPosition: 4, // grammarY
        currentId: grammarYId,
        direction: "previous",
      });
      expect(previous).toEqual({ id: aguaId });

      // rojo (level 2) is the very last item in this isolated language.
      const noNext = await getAdjacentAdminCurriculumItem(tx, {
        languageId,
        currentLevelNumber: 2,
        currentPosition: 1,
        currentId: rojoId,
        direction: "next",
      });
      expect(noNext).toBeNull();
    });
  });

  it("anyIncomplete finds the next item missing anything, skipping ones already fully metadata-complete", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, gatoId, casaId, aguaId } =
        await seedIsolatedCurriculum(tx);

      // Fill in casa completely so it's no longer "incomplete."
      await tx
        .update(vocabularyItems)
        .set({
          definition: "a house",
          ipa: "/ˈka.sa/",
          pronunciation: "KAH-sah",
        })
        .where(eq(vocabularyItems.learningItemId, casaId));
      const [sentence] = await tx
        .insert(sentences)
        .values({
          languageId,
          targetText: "La casa es grande.",
          translation: "The house is big.",
        })
        .returning();
      await tx.insert(learningItemSentences).values({
        learningItemId: casaId,
        sentenceId: sentence!.id,
        position: 1,
      });
      await tx.insert(acceptedAnswers).values([
        {
          learningItemId: casaId,
          side: "meaning",
          value: "home",
          normalizedValue: "home",
        },
        {
          learningItemId: casaId,
          side: "term",
          value: "casita",
          normalizedValue: "casita",
        },
      ]);

      const nextIncomplete = await getAdjacentAdminCurriculumItem(tx, {
        languageId,
        currentLevelNumber: 1,
        currentPosition: 1, // gato
        currentId: gatoId,
        direction: "next",
        anyIncomplete: true,
      });
      // casa is next by position but now complete — skips straight to agua.
      expect(nextIncomplete).toEqual({ id: aguaId });
    });
  });
});

describe("getLevelContentSummary (spec 25 §15)", () => {
  it("summarizes one level's editorial completeness", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, casaId } = await seedIsolatedCurriculum(tx);

      await tx
        .update(vocabularyItems)
        .set({ definition: "a house" })
        .where(eq(vocabularyItems.learningItemId, casaId));

      const summary = await getLevelContentSummary(tx, {
        languageId,
        levelId: level1Id,
      });

      // gato, casa, agua, grammarY — grammarY already has a real explanation.
      expect(summary.totalItems).toBe(4);
      expect(summary.needsDefinitionCount).toBe(2); // gato, agua (casa now filled, grammarY was never blank)
      expect(summary.metadataCompleteCount).toBe(0); // every item is still missing something else
      expect(summary.draftChangesCount).toBe(0);
    });
  });
});
