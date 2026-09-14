import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  findReviewPreferences,
  saveGrammarHintMode,
  saveGrammarHintOrder,
  saveGrammarReviewType,
  saveReviewUiToggle,
  saveUndoAction,
  saveVocabularyHintMode,
  saveVocabularyHintOrder,
  saveVocabularyReviewType,
} from "./review-preference-repository";

const DEFAULTS = {
  grammarReviewType: "cloze_manual",
  vocabularyReviewType: "cloze_manual",
  grammarHintOrder: "nuance_first",
  vocabularyHintOrder: "nuance_first",
  grammarHintMode: "hint",
  vocabularyHintMode: "hint",
  autoplayAudio: true,
  lightningMode: false,
  focusMode: false,
  autoHighlightErrors: true,
  showSrsStage: true,
  autoExpandInfo: false,
  undoAction: "clear_last_character",
} as const;

describe("findReviewPreferences", () => {
  it("returns the centralized defaults when no row exists yet", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      const preferences = await findReviewPreferences(tx, learnerId, languageId);
      expect(preferences).toEqual({ userId: learnerId, languageId, ...DEFAULTS });
    });
  });
});

describe("saveGrammarReviewType / saveVocabularyReviewType", () => {
  it("persists only the field that changed, leaving the others at their defaults", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      const afterFirstSave = await saveVocabularyReviewType(tx, { userId: learnerId, languageId, reviewType: "flashcard" });
      expect(afterFirstSave).toEqual({ userId: learnerId, languageId, ...DEFAULTS, vocabularyReviewType: "flashcard" });

      const stored = await findReviewPreferences(tx, learnerId, languageId);
      expect(stored).toEqual({ userId: learnerId, languageId, ...DEFAULTS, vocabularyReviewType: "flashcard" });
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
        ...DEFAULTS,
        grammarReviewType: "flashcard",
        vocabularyReviewType: "cloze_flashcard",
      });
    });
  });
});

describe("Review Hints saves", () => {
  it("saves grammar and vocabulary Hint Order/Mode independently of each other and of Review Type", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      await saveGrammarHintOrder(tx, { userId: learnerId, languageId, hintOrder: "translation_first" });
      await saveVocabularyHintMode(tx, { userId: learnerId, languageId, hintMode: "show" });
      const afterAll = await saveGrammarHintMode(tx, { userId: learnerId, languageId, hintMode: "always_show_nuance" });

      expect(afterAll).toEqual({
        userId: learnerId,
        languageId,
        ...DEFAULTS,
        grammarHintOrder: "translation_first",
        vocabularyHintMode: "show",
        grammarHintMode: "always_show_nuance",
      });

      // vocabularyHintOrder untouched by any of the above.
      const stored = await findReviewPreferences(tx, learnerId, languageId);
      expect(stored.vocabularyHintOrder).toBe("nuance_first");
    });
  });

  it("saveVocabularyHintOrder is independent of saveGrammarHintOrder", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      const result = await saveVocabularyHintOrder(tx, { userId: learnerId, languageId, hintOrder: "translation_first" });
      expect(result.vocabularyHintOrder).toBe("translation_first");
      expect(result.grammarHintOrder).toBe("nuance_first");
    });
  });
});

describe("Review UI saves", () => {
  it("saves one boolean toggle without affecting the others", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      const afterFirst = await saveReviewUiToggle(tx, { userId: learnerId, languageId, field: "lightningMode", value: true });
      expect(afterFirst).toEqual({ userId: learnerId, languageId, ...DEFAULTS, lightningMode: true });

      const afterSecond = await saveReviewUiToggle(tx, { userId: learnerId, languageId, field: "focusMode", value: true });
      expect(afterSecond).toEqual({ userId: learnerId, languageId, ...DEFAULTS, lightningMode: true, focusMode: true });
    });
  });

  it("saveUndoAction persists independently of the boolean toggles", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      const result = await saveUndoAction(tx, { userId: learnerId, languageId, undoAction: "clear_all_characters" });
      expect(result).toEqual({ userId: learnerId, languageId, ...DEFAULTS, undoAction: "clear_all_characters" });
    });
  });
});
