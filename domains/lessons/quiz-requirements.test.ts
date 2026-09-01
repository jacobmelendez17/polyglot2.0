import { describe, expect, it } from "vitest";

import type { GrammarItem, VocabularyItem } from "@/domains/curriculum";

import { buildQuizQuestions, getQuestionAnswerSpec } from "./quiz-requirements";

const gato: VocabularyItem = {
  type: "vocabulary",
  id: "vocab-gato",
  languageId: "es-MX",
  levelId: 1,
  lessonPriority: 1,
  word: "gato",
  article: "el",
  partOfSpeech: "noun",
  meanings: ["cat"],
  targetVariants: [],
  pronunciation: { guide: "GAH-toh" },
  examples: [],
  resources: [],
};

const aprender: VocabularyItem = {
  type: "vocabulary",
  id: "vocab-aprender",
  languageId: "es-MX",
  levelId: 1,
  lessonPriority: 2,
  word: "aprender",
  partOfSpeech: "verb",
  meanings: ["to learn"],
  targetVariants: [],
  pronunciation: { guide: "ah-prehn-DEHR" },
  examples: [],
  resources: [],
};

const y: GrammarItem = {
  type: "grammar",
  id: "grammar-y",
  languageId: "es-MX",
  levelId: 1,
  lessonPriority: 3,
  structure: "y",
  meaning: "and",
  explanation: "Connects two things.",
  usage: "Conjunction",
  examples: [],
  resources: [],
  requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
};

describe("buildQuizQuestions", () => {
  it("produces both required directions for vocabulary", () => {
    const questions = buildQuizQuestions([gato]);
    expect(questions.map((q) => q.direction).sort()).toEqual(["englishToTarget", "targetToEnglish"]);
  });

  it("uses the grammar concept's configured requirements", () => {
    const questions = buildQuizQuestions([y]);
    expect(questions).toEqual([
      { id: "grammar-y::targetToEnglish", itemId: "grammar-y", itemType: "grammar", direction: "targetToEnglish" },
    ]);
  });

  it("builds requirements for a mixed batch", () => {
    const questions = buildQuizQuestions([gato, aprender, y]);
    expect(questions).toHaveLength(5);
  });
});

describe("getQuestionAnswerSpec", () => {
  it("requires the article for English to Spanish", () => {
    const spec = getQuestionAnswerSpec(gato, "englishToTarget");
    expect(spec.acceptedAnswers).toEqual(["el gato"]);
    expect(spec.articleRequirement).toEqual({ article: "el", bareAnswers: ["gato"] });
  });

  it("does not require an article for Spanish to English", () => {
    const spec = getQuestionAnswerSpec(gato, "targetToEnglish");
    expect(spec.acceptedAnswers).toEqual(["cat"]);
    expect(spec.articleRequirement).toBeUndefined();
  });

  it("does not require an article for a non-noun vocabulary item", () => {
    const spec = getQuestionAnswerSpec(aprender, "englishToTarget");
    expect(spec.acceptedAnswers).toEqual(["aprender"]);
    expect(spec.articleRequirement).toBeUndefined();
  });

  it("resolves grammar translation requirements", () => {
    const spec = getQuestionAnswerSpec(y, "targetToEnglish");
    expect(spec.acceptedAnswers).toEqual(["and"]);
    expect(spec.prompt).toBe("y");
  });
});
