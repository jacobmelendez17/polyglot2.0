import { describe, expect, it } from "vitest";

import type { CurriculumLearningItem } from "@/domains/curriculum";

import { buildReviewQuestions, interleaveReviewQuestions } from "./review-queue";

function vocab(id: string): CurriculumLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position: 1,
    lessonPriority: 1,
    type: "vocabulary",
    vocabulary: {
      vocabularyGroupId: "group-1",
      term: `term-${id}`,
      primaryMeaning: `meaning-${id}`,
      definition: null,
      article: null,
      partOfSpeech: "noun",
      pronunciation: null,
      ipa: null,
      context: null,
      creatorNotes: null,
    },
  };
}

function grammar(id: string, requiredQuestions: { format: "translation"; direction: "targetToEnglish" | "englishToTarget" }[]): CurriculumLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position: 1,
    lessonPriority: 1,
    type: "grammar",
    grammar: {
      title: null,
      structure: `structure-${id}`,
      primaryMeaning: `meaning-${id}`,
      explanation: "explanation",
      category: null,
      creatorNotes: null,
      requiredQuestions,
    },
  };
}

describe("buildReviewQuestions", () => {
  it("requires both directions for a vocabulary item (spec 09 §7)", () => {
    const questions = buildReviewQuestions([vocab("v1")]);
    expect(questions).toEqual([
      { id: "v1::targetToEnglish", itemId: "v1", itemType: "vocabulary", direction: "targetToEnglish" },
      { id: "v1::englishToTarget", itemId: "v1", itemType: "vocabulary", direction: "englishToTarget" },
    ]);
  });

  it("uses exactly the grammar item's configured required questions — never assumes bidirectional", () => {
    const questions = buildReviewQuestions([grammar("g1", [{ format: "translation", direction: "targetToEnglish" }])]);
    expect(questions).toEqual([
      { id: "g1::targetToEnglish", itemId: "g1", itemType: "grammar", direction: "targetToEnglish" },
    ]);
  });

  it("supports a grammar item configured for both directions", () => {
    const questions = buildReviewQuestions([
      grammar("g2", [
        { format: "translation", direction: "targetToEnglish" },
        { format: "translation", direction: "englishToTarget" },
      ]),
    ]);
    expect(questions).toHaveLength(2);
  });
});

describe("interleaveReviewQuestions", () => {
  it("never places the same item's two questions consecutively when another item is available", () => {
    const questions = buildReviewQuestions([vocab("v1"), vocab("v2")]);
    const ordered = interleaveReviewQuestions(questions);

    expect(ordered.map((q) => q.itemId)).toEqual(["v1", "v2", "v1", "v2"]);
  });

  it("preserves every question exactly once", () => {
    const questions = buildReviewQuestions([vocab("v1"), grammar("g1", [{ format: "translation", direction: "targetToEnglish" }]), vocab("v2")]);
    const ordered = interleaveReviewQuestions(questions);

    expect(ordered).toHaveLength(questions.length);
    expect(new Set(ordered.map((q) => q.id))).toEqual(new Set(questions.map((q) => q.id)));
  });

  it("is deterministic — the same input always produces the same order", () => {
    const questions = buildReviewQuestions([vocab("v1"), vocab("v2"), vocab("v3")]);
    expect(interleaveReviewQuestions(questions)).toEqual(interleaveReviewQuestions(questions));
  });
});
