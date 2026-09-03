import { describe, expect, it } from "vitest";

import type { CurriculumLearningItem } from "@/domains/curriculum";
import type { LearnerSynonym } from "@/domains/learner-content";

import { getReviewQuestionAnswerSpec } from "./review-answer-spec";

const NO_SYNONYMS: LearnerSynonym[] = [];

const gato: CurriculumLearningItem = {
  id: "gato",
  languageId: "lang-1",
  levelId: "level-1",
  status: "published",
  position: 1,
  lessonPriority: 1,
  type: "vocabulary",
  vocabulary: {
    vocabularyGroupId: "group-1",
    term: "gato",
    primaryMeaning: "cat",
    definition: null,
    article: "el",
    partOfSpeech: "noun",
    pronunciation: null,
    ipa: null,
    context: null,
    creatorNotes: null,
  },
};

const y: CurriculumLearningItem = {
  id: "y",
  languageId: "lang-1",
  levelId: "level-1",
  status: "published",
  position: 1,
  lessonPriority: 1,
  type: "grammar",
  grammar: {
    title: null,
    structure: "y",
    primaryMeaning: "and",
    explanation: "Connects two words.",
    category: null,
    creatorNotes: null,
    requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
  },
};

function synonym(side: "term" | "meaning", value: string): LearnerSynonym {
  return { id: "syn-1", userId: "user-1", learningItemId: "gato", side, value, normalizedValue: value.toLowerCase() };
}

describe("getReviewQuestionAnswerSpec — vocabulary", () => {
  it("target -> English: accepts the official primary meaning", () => {
    const spec = getReviewQuestionAnswerSpec(gato, "targetToEnglish", NO_SYNONYMS);
    expect(spec.prompt).toBe("gato");
    expect(spec.acceptedAnswers).toEqual(["cat"]);
  });

  it("English -> target: requires the article and flags a bare-form answer as missing_article via the article requirement", () => {
    const spec = getReviewQuestionAnswerSpec(gato, "englishToTarget", NO_SYNONYMS);
    expect(spec.prompt).toBe("cat");
    expect(spec.acceptedAnswers).toEqual(["el gato"]);
    expect(spec.articleRequirement).toEqual({ article: "el", bareAnswers: ["gato"] });
  });

  it("includes an applicable user-created synonym alongside the official answer", () => {
    const spec = getReviewQuestionAnswerSpec(gato, "targetToEnglish", [synonym("meaning", "kitty")]);
    expect(spec.acceptedAnswers).toEqual(["cat", "kitty"]);
  });

  it("only includes synonyms for the matching side", () => {
    const spec = getReviewQuestionAnswerSpec(gato, "targetToEnglish", [synonym("term", "gatito")]);
    expect(spec.acceptedAnswers).toEqual(["cat"]);
  });

  it("a vocabulary item with no article has no article requirement", () => {
    const noArticleItem: CurriculumLearningItem = { ...gato, vocabulary: { ...gato.vocabulary, article: null } };
    const spec = getReviewQuestionAnswerSpec(noArticleItem, "englishToTarget", NO_SYNONYMS);
    expect(spec.articleRequirement).toBeUndefined();
    expect(spec.acceptedAnswers).toEqual(["gato"]);
  });
});

describe("getReviewQuestionAnswerSpec — grammar", () => {
  it("uses the item's structure/meaning for whichever direction is asked", () => {
    const targetToEnglish = getReviewQuestionAnswerSpec(y, "targetToEnglish", NO_SYNONYMS);
    expect(targetToEnglish.prompt).toBe("y");
    expect(targetToEnglish.acceptedAnswers).toEqual(["and"]);

    const englishToTarget = getReviewQuestionAnswerSpec(y, "englishToTarget", NO_SYNONYMS);
    expect(englishToTarget.prompt).toBe("and");
    expect(englishToTarget.acceptedAnswers).toEqual(["y"]);
  });
});
