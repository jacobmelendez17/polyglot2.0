import { describe, expect, it } from "vitest";

import type {
  AcceptedAnswerInput,
  CurriculumLearningItem,
} from "@/domains/curriculum";
import type { LearnerSynonym } from "@/domains/learner-content";

import { getReviewQuestionAnswerSpec } from "./review-answer-spec";

const NO_SYNONYMS: LearnerSynonym[] = [];
const NO_OFFICIAL_ANSWERS: AcceptedAnswerInput[] = [];

const gato: CurriculumLearningItem = {
  id: "gato",
  languageId: "lang-1",
  levelId: "level-1",
  status: "published",
  position: 1,
  lessonPriority: 1,
  version: 1,
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
    register: null,
    dictionaryFieldOverrides: [],
  },
};

const y: CurriculumLearningItem = {
  id: "y",
  languageId: "lang-1",
  levelId: "level-1",
  status: "published",
  position: 1,
  lessonPriority: 1,
  version: 1,
  type: "grammar",
  grammar: {
    title: null,
    structure: "y",
    primaryMeaning: "and",
    explanation: "Connects two words.",
    category: null,
    creatorNotes: null,
    register: null,
    requiredQuestions: [
      { format: "translation", direction: "targetToEnglish" },
    ],
  },
};

function synonym(side: "term" | "meaning", value: string): LearnerSynonym {
  return {
    id: "syn-1",
    userId: "user-1",
    learningItemId: "gato",
    side,
    value,
    normalizedValue: value.toLowerCase(),
  };
}

describe("getReviewQuestionAnswerSpec — vocabulary", () => {
  it("target -> English: accepts the official primary meaning", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "targetToEnglish",
      NO_SYNONYMS,
      NO_OFFICIAL_ANSWERS,
    );
    expect(spec.prompt).toBe("gato");
    expect(spec.acceptedAnswers).toEqual(["cat"]);
  });

  it("English -> target: requires the article and flags a bare-form answer as missing_article via the article requirement", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "englishToTarget",
      NO_SYNONYMS,
      NO_OFFICIAL_ANSWERS,
    );
    expect(spec.prompt).toBe("cat");
    expect(spec.acceptedAnswers).toEqual(["el gato"]);
    expect(spec.articleRequirement).toEqual({
      article: "el",
      bareAnswers: ["gato"],
    });
  });

  it("includes an applicable user-created synonym alongside the official answer", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "targetToEnglish",
      [synonym("meaning", "kitty")],
      NO_OFFICIAL_ANSWERS,
    );
    expect(spec.acceptedAnswers).toEqual(["cat", "kitty"]);
  });

  it("only includes synonyms for the matching side", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "targetToEnglish",
      [synonym("term", "gatito")],
      NO_OFFICIAL_ANSWERS,
    );
    expect(spec.acceptedAnswers).toEqual(["cat"]);
  });

  it("a vocabulary item with no article has no article requirement", () => {
    const noArticleItem: CurriculumLearningItem = {
      ...gato,
      type: "vocabulary",
      vocabulary: { ...gato.vocabulary, article: null },
    };
    const spec = getReviewQuestionAnswerSpec(
      noArticleItem,
      "englishToTarget",
      NO_SYNONYMS,
      NO_OFFICIAL_ANSWERS,
    );
    expect(spec.articleRequirement).toBeUndefined();
    expect(spec.acceptedAnswers).toEqual(["gato"]);
  });

  // 2026-09-23 fix: an admin's own accepted_answers (AcceptedAnswersEditor)
  // used to be silently ignored here — accepted in Lessons, rejected in
  // Reviews for the exact same item.
  it("includes an official curriculum-authored synonym alongside the primary meaning and any user synonym", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "targetToEnglish",
      [synonym("meaning", "kitty")],
      [{ side: "meaning", value: "feline" }],
    );
    expect(spec.acceptedAnswers).toEqual(["cat", "feline", "kitty"]);
  });

  it("includes an official curriculum-authored term variant, article-prefixed like the term itself", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "englishToTarget",
      NO_SYNONYMS,
      [{ side: "term", value: "gatito" }],
    );
    expect(spec.acceptedAnswers).toEqual(["el gato", "el gatito"]);
    expect(spec.articleRequirement).toEqual({
      article: "el",
      bareAnswers: ["gato", "gatito"],
    });
  });

  it("only includes official answers for the matching side", () => {
    const spec = getReviewQuestionAnswerSpec(
      gato,
      "targetToEnglish",
      NO_SYNONYMS,
      [{ side: "term", value: "gatito" }],
    );
    expect(spec.acceptedAnswers).toEqual(["cat"]);
  });
});

describe("getReviewQuestionAnswerSpec — grammar", () => {
  it("uses the item's structure/meaning for whichever direction is asked", () => {
    const targetToEnglish = getReviewQuestionAnswerSpec(
      y,
      "targetToEnglish",
      NO_SYNONYMS,
      NO_OFFICIAL_ANSWERS,
    );
    expect(targetToEnglish.prompt).toBe("y");
    expect(targetToEnglish.acceptedAnswers).toEqual(["and"]);

    const englishToTarget = getReviewQuestionAnswerSpec(
      y,
      "englishToTarget",
      NO_SYNONYMS,
      NO_OFFICIAL_ANSWERS,
    );
    expect(englishToTarget.prompt).toBe("and");
    expect(englishToTarget.acceptedAnswers).toEqual(["y"]);
  });

  it("includes an official curriculum-authored synonym on the target -> English direction", () => {
    const spec = getReviewQuestionAnswerSpec(
      y,
      "targetToEnglish",
      NO_SYNONYMS,
      [{ side: "meaning", value: "plus" }],
    );
    expect(spec.acceptedAnswers).toEqual(["and", "plus"]);
  });

  it("never widens the English -> target direction — a grammar structure is exact, never a variant", () => {
    const spec = getReviewQuestionAnswerSpec(
      y,
      "englishToTarget",
      NO_SYNONYMS,
      [{ side: "term", value: "e" }],
    );
    expect(spec.acceptedAnswers).toEqual(["y"]);
  });
});
