import { describe, expect, it } from "vitest";

import { resolveReviewHint } from "./review-hint";
import type { CurriculumLearningItem } from "@/domains/curriculum";

function vocab(
  overrides: Partial<
    Extract<CurriculumLearningItem, { type: "vocabulary" }>["vocabulary"]
  > = {},
): CurriculumLearningItem {
  return {
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
      context: "Used for domestic cats.",
      creatorNotes: null,
      register: null,
      dictionaryFieldOverrides: [],
      ...overrides,
    },
  };
}

function grammar(
  overrides: Partial<
    Extract<CurriculumLearningItem, { type: "grammar" }>["grammar"]
  > = {},
): CurriculumLearningItem {
  return {
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
      creatorNotes: "Never elides before a consonant sound.",
      register: null,
      requiredQuestions: [
        { format: "translation", direction: "targetToEnglish" },
      ],
      ...overrides,
    },
  };
}

describe("resolveReviewHint", () => {
  it("hide: no content at all", () => {
    expect(
      resolveReviewHint({
        hintMode: "hide",
        hintOrder: "nuance_first",
        item: vocab(),
      }),
    ).toEqual({ mode: "hide" });
  });

  it("hint: the vocabulary item's context, never the term or meaning", () => {
    const result = resolveReviewHint({
      hintMode: "hint",
      hintOrder: "nuance_first",
      item: vocab(),
    });
    expect(result).toEqual({ mode: "hint", nuance: "Used for domestic cats." });
  });

  it("hint: falls back to creatorNotes when a vocabulary item has no context", () => {
    const item = vocab({
      context: null,
      creatorNotes: "Colloquial in some regions.",
    });
    expect(
      resolveReviewHint({ hintMode: "hint", hintOrder: "nuance_first", item }),
    ).toEqual({
      mode: "hint",
      nuance: "Colloquial in some regions.",
    });
  });

  it("hint: grammar has no context field, so creatorNotes is its only source", () => {
    const result = resolveReviewHint({
      hintMode: "hint",
      hintOrder: "nuance_first",
      item: grammar(),
    });
    expect(result).toEqual({
      mode: "hint",
      nuance: "Never elides before a consonant sound.",
    });
  });

  it("hint: null when the item has neither field authored", () => {
    const item = vocab({ context: null, creatorNotes: null });
    expect(
      resolveReviewHint({ hintMode: "hint", hintOrder: "nuance_first", item }),
    ).toEqual({ mode: "hint", nuance: null });
  });

  it("show: the item's plain English meaning", () => {
    expect(
      resolveReviewHint({
        hintMode: "show",
        hintOrder: "nuance_first",
        item: vocab(),
      }),
    ).toEqual({
      mode: "show",
      translation: "cat",
    });
  });

  it("more: both pieces of content, in the order Hint Order picks", () => {
    const nuanceFirst = resolveReviewHint({
      hintMode: "more",
      hintOrder: "nuance_first",
      item: vocab(),
    });
    expect(nuanceFirst).toEqual({
      mode: "more",
      order: "nuance_first",
      translation: "cat",
      nuance: "Used for domestic cats.",
    });

    const translationFirst = resolveReviewHint({
      hintMode: "more",
      hintOrder: "translation_first",
      item: vocab(),
    });
    expect(translationFirst).toEqual({
      mode: "more",
      order: "translation_first",
      translation: "cat",
      nuance: "Used for domestic cats.",
    });
  });

  it("always_show_nuance: only the nuance note, never the translation", () => {
    const result = resolveReviewHint({
      hintMode: "always_show_nuance",
      hintOrder: "nuance_first",
      item: vocab(),
    });
    expect(result).toEqual({
      mode: "always_show_nuance",
      nuance: "Used for domestic cats.",
    });
  });
});
