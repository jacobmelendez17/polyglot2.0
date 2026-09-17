import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  LEARNER_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { learningItems, vocabularyItems } from "@/db/schema";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getVocabularyDetail } from "./lexicon-read-model";

/**
 * `getVocabularyDetail` had no dedicated test coverage before spec 13 — it
 * was built in spec 12 but nothing consumed it until `/items/[itemId]`.
 * Covers the read model's own composition (this file), not the page.
 *
 * `ITEM_GATO_ID`/`ITEM_CASA_ID` from `seedTestFixtures` are real rows in the
 * shared dev database this suite runs against (`TEST_DATABASE_URL` ==
 * `DATABASE_URL`), and a real Lexicon import has since mapped them to real
 * dictionary entries (spec 12) — so their dictionary-mapped status is
 * ambient, real-world state, not something this suite controls. Tests that
 * need a guaranteed-unmapped item insert their own fresh row instead of
 * assuming gato/casa's current state, for the same reason spec 09's Unit 2
 * inserted its own throwaway language fixture rather than assuming only one
 * language existed.
 */
describe("getVocabularyDetail", () => {
  it("composes the curriculum half — including examples — for a published item", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);

      const detail = await getVocabularyDetail(tx, {
        vocabularyItemId: ITEM_GATO_ID,
      });

      expect(detail).not.toBeNull();
      expect(detail?.curriculum.displayWord).toBe("el gato");
      expect(detail?.curriculum.translation).toBe("cat");
      expect(detail?.curriculum.examples).toEqual([
        {
          targetText: "El gato duerme.",
          translation: "The cat sleeps.",
          usageContext: null,
        },
      ]);
      expect(detail?.progress).toBeNull();
    });
  });

  it("leaves dictionary null for an item with no mapping — a normal, fully usable curriculum item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);

      const [item] = await tx
        .insert(learningItems)
        .values({
          languageId,
          levelId: level1Id,
          type: "vocabulary",
          status: "published",
          position: 99,
          lessonPriority: 99,
        })
        .returning();
      await tx.insert(vocabularyItems).values({
        learningItemId: item.id,
        vocabularyGroupId: vocabGroupId,
        term: "xyzzy",
        primaryMeaning: "a nonsense test word",
        partOfSpeech: "noun",
      });

      const detail = await getVocabularyDetail(tx, {
        vocabularyItemId: item.id,
      });

      expect(detail?.curriculum.translation).toBe("a nonsense test word");
      expect(detail?.dictionary).toBeNull();
    });
  });

  it("returns null for an id that does not exist", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const detail = await getVocabularyDetail(tx, {
        vocabularyItemId: "40000000-0000-0000-0000-00000000ffff",
      });
      expect(detail).toBeNull();
    });
  });

  it("includes the given user's own progress row when one exists", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const detail = await getVocabularyDetail(tx, {
        vocabularyItemId: ITEM_GATO_ID,
        userId: LEARNER_ID,
      });
      expect(detail?.progress?.srsStage).toBe("beginner_2");
    });
  });

  it("hides an archived item by default, and surfaces it when includeArchived is set (spec 13: still referenceable by direct link)", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      await tx
        .update(learningItems)
        .set({ status: "archived" })
        .where(eq(learningItems.id, ITEM_CASA_ID));

      expect(
        await getVocabularyDetail(tx, { vocabularyItemId: ITEM_CASA_ID }),
      ).toBeNull();

      const archived = await getVocabularyDetail(tx, {
        vocabularyItemId: ITEM_CASA_ID,
        includeArchived: true,
      });
      expect(archived?.curriculum.learningItemId).toBe(ITEM_CASA_ID);
      expect(archived?.curriculum.displayWord).toBe("la casa");
    });
  });

  it("still hides a pending item even with includeArchived set — the option only widens to archived, never to draft/pending", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      await tx
        .update(learningItems)
        .set({ status: "pending" })
        .where(eq(learningItems.id, ITEM_CASA_ID));

      const detail = await getVocabularyDetail(tx, {
        vocabularyItemId: ITEM_CASA_ID,
        includeArchived: true,
      });
      expect(detail).toBeNull();
    });
  });
});
