import { describe, expect, it } from "vitest";

import { interleaveQuizQuestions } from "./quiz-order";
import { buildQuizQuestions } from "./quiz-requirements";
import type { GrammarItem, VocabularyItem } from "@/domains/curriculum";

function makeVocab(id: string): VocabularyItem {
  return {
    type: "vocabulary",
    id,
    languageId: "es-MX",
    levelId: 1,
    lessonPriority: 1,
    word: id,
    partOfSpeech: "noun",
    meanings: ["placeholder"],
    targetVariants: [],
    pronunciation: { guide: "placeholder" },
    examples: [],
    resources: [],
  };
}

function makeGrammar(id: string): GrammarItem {
  return {
    type: "grammar",
    id,
    languageId: "es-MX",
    levelId: 1,
    lessonPriority: 1,
    structure: id,
    meaning: "placeholder",
    explanation: "placeholder",
    usage: "placeholder",
    examples: [],
    resources: [],
    requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
  };
}

describe("interleaveQuizQuestions", () => {
  it("never places an item's two directions adjacently", () => {
    const items = [makeVocab("a"), makeVocab("b"), makeVocab("c")];
    const questions = buildQuizQuestions(items);
    const ordered = interleaveQuizQuestions(questions);

    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].itemId).not.toBe(ordered[i - 1].itemId);
    }
  });

  it("is deterministic across repeated calls", () => {
    const items = [makeVocab("a"), makeVocab("b"), makeVocab("c"), makeGrammar("d")];
    const questions = buildQuizQuestions(items);
    const first = interleaveQuizQuestions(questions).map((q) => q.id);
    const second = interleaveQuizQuestions(buildQuizQuestions(items)).map((q) => q.id);
    expect(first).toEqual(second);
  });

  it("includes every question exactly once", () => {
    const items = [makeVocab("a"), makeVocab("b"), makeGrammar("c")];
    const questions = buildQuizQuestions(items);
    const ordered = interleaveQuizQuestions(questions);
    expect(ordered).toHaveLength(questions.length);
    expect(new Set(ordered.map((q) => q.id)).size).toBe(questions.length);
  });

  it("interleaves round-robin: every item's first question before any item's second", () => {
    const items = [makeVocab("a"), makeVocab("b")];
    const questions = buildQuizQuestions(items);
    const ordered = interleaveQuizQuestions(questions);
    // a:targetToEnglish, b:targetToEnglish, a:englishToTarget, b:englishToTarget
    expect(ordered.map((q) => q.id)).toEqual([
      "a::targetToEnglish",
      "b::targetToEnglish",
      "a::englishToTarget",
      "b::englishToTarget",
    ]);
  });
});
