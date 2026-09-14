import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { findReviewPreferences, saveGrammarReviewType, saveVocabularyReviewType } from "./review-preference-repository";

describe("findReviewPreferences", () => {
  it("returns the centralized defaults when no row exists yet", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      const preferences = await findReviewPreferences(tx, learnerId, languageId);
      expect(preferences).toEqual({
        userId: learnerId,
        languageId,
        grammarReviewType: "cloze_manual",
        vocabularyReviewType: "cloze_manual",
      });
    });
  });
});

describe("saveGrammarReviewType / saveVocabularyReviewType", () => {
  it("persists only the field that changed, leaving the other at its default", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      const afterFirstSave = await saveVocabularyReviewType(tx, { userId: learnerId, languageId, reviewType: "flashcard" });
      expect(afterFirstSave.vocabularyReviewType).toBe("flashcard");
      expect(afterFirstSave.grammarReviewType).toBe("cloze_manual");

      const stored = await findReviewPreferences(tx, learnerId, languageId);
      expect(stored).toEqual({ userId: learnerId, languageId, grammarReviewType: "cloze_manual", vocabularyReviewType: "flashcard" });
    });
  });

  it("a second save updates only its own field, without clobbering the first", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      await saveVocabularyReviewType(tx, { userId: learnerId, languageId, reviewType: "cloze_flashcard" });
      const afterSecondSave = await saveGrammarReviewType(tx, { userId: learnerId, languageId, reviewType: "flashcard" });

      expect(afterSecondSave).toEqual({
        userId: learnerId,
        languageId,
        grammarReviewType: "flashcard",
        vocabularyReviewType: "cloze_flashcard",
      });
    });
  });
});
