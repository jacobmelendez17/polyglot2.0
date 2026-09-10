import { describe, expect, it } from "vitest";

import type { CurriculumLearningItem } from "@/domains/curriculum";

import { buildDeckPracticeQuestions, deckItemLabel, summarizeDeckPractice } from "./deck-practice";
import type { DeckPracticeClassification } from "./deck-practice";

function vocabulary(id: string, term: string, meaning: string, article: string | null = null): CurriculumLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position: 1,
    lessonPriority: 1,
    version: 1,
    type: "vocabulary",
    vocabulary: {
      vocabularyGroupId: "group-1",
      term,
      primaryMeaning: meaning,
      definition: null,
      article,
      partOfSpeech: "noun",
      pronunciation: null,
      ipa: null,
      context: null,
      creatorNotes: null,
      register: null,
      dictionaryFieldOverrides: [],
    },
  };
}

function grammar(
  id: string,
  structure: string,
  meaning: string,
  directions: ("targetToEnglish" | "englishToTarget")[] = ["targetToEnglish"],
): CurriculumLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position: 1,
    lessonPriority: 1,
    version: 1,
    type: "grammar",
    grammar: {
      title: null,
      structure,
      primaryMeaning: meaning,
      explanation: "explanation",
      category: null,
      creatorNotes: null,
      register: null,
      requiredQuestions: directions.map((direction) => ({ format: "translation" as const, direction })),
    },
  };
}

describe("deckItemLabel", () => {
  it("includes the article for a vocabulary item that requires one", () => {
    expect(deckItemLabel(vocabulary("v1", "gato", "cat", "el"))).toBe("el gato");
    expect(deckItemLabel(vocabulary("v2", "correr", "to run"))).toBe("correr");
  });

  it("uses the structure for a grammar item", () => {
    expect(deckItemLabel(grammar("g1", "y", "and"))).toBe("y");
  });
});

describe("buildDeckPracticeQuestions", () => {
  it("asks vocabulary in both directions, matching normal review behavior", () => {
    const questions = buildDeckPracticeQuestions([vocabulary("v1", "gato", "cat", "el")], "Spanish");
    expect(questions.map((question) => question.direction).sort()).toEqual(["englishToTarget", "targetToEnglish"]);
  });

  it("asks grammar in exactly its configured directions, never an assumed pair", () => {
    const questions = buildDeckPracticeQuestions([grammar("g1", "y", "and")], "Spanish");
    expect(questions).toHaveLength(1);
    expect(questions[0].direction).toBe("targetToEnglish");

    const bidirectional = buildDeckPracticeQuestions(
      [grammar("g2", "pero", "but", ["targetToEnglish", "englishToTarget"])],
      "Spanish",
    );
    expect(bidirectional).toHaveLength(2);
  });

  it("lets vocabulary and grammar coexist in one session", () => {
    const questions = buildDeckPracticeQuestions([vocabulary("v1", "gato", "cat"), grammar("g1", "y", "and")], "Spanish");
    expect(questions.map((question) => question.itemType)).toContain("vocabulary");
    expect(questions.map((question) => question.itemType)).toContain("grammar");
  });

  it("prompts in the right direction and labels it with the real language name", () => {
    const questions = buildDeckPracticeQuestions([vocabulary("v1", "gato", "cat", "el")], "Spanish");
    const targetToEnglish = questions.find((question) => question.direction === "targetToEnglish")!;
    const englishToTarget = questions.find((question) => question.direction === "englishToTarget")!;

    expect(targetToEnglish.prompt).toBe("gato");
    expect(targetToEnglish.directionLabel).toBe("Spanish → English");
    expect(englishToTarget.prompt).toBe("cat");
    expect(englishToTarget.directionLabel).toBe("English → Spanish");
  });

  it("never ships an accepted answer to the browser", () => {
    const questions = buildDeckPracticeQuestions([vocabulary("v1", "gato", "cat", "el")], "Spanish");
    for (const question of questions) {
      expect(Object.keys(question)).not.toContain("acceptedAnswers");
      expect(Object.keys(question)).not.toContain("expectedAnswer");
    }
  });

  it("interleaves so one item's two directions are not adjacent when another item is available", () => {
    const questions = buildDeckPracticeQuestions(
      [vocabulary("v1", "gato", "cat"), vocabulary("v2", "perro", "dog")],
      "Spanish",
    );
    expect(questions).toHaveLength(4);
    expect(questions[0].learningItemId).not.toBe(questions[1].learningItemId);
  });

  it("drops a question whose item was not supplied rather than inventing one", () => {
    expect(buildDeckPracticeQuestions([], "Spanish")).toEqual([]);
  });
});

describe("summarizeDeckPractice", () => {
  const classifications: DeckPracticeClassification[] = [
    { learningItemId: "v1", itemLabel: "el gato", verdict: "know" },
    { learningItemId: "v2", itemLabel: "el perro", verdict: "dont_know" },
    { learningItemId: "g1", itemLabel: "y", verdict: "know" },
  ];

  it("counts and groups by Know / Don't Know", () => {
    const summary = summarizeDeckPractice(classifications);
    expect(summary.knowCount).toBe(2);
    expect(summary.dontKnowCount).toBe(1);
    expect(summary.know.map((entry) => entry.learningItemId)).toEqual(["v1", "g1"]);
    expect(summary.dontKnow.map((entry) => entry.learningItemId)).toEqual(["v2"]);
  });

  it("counts an item once, using its latest verdict", () => {
    const summary = summarizeDeckPractice([
      ...classifications,
      { learningItemId: "v2", itemLabel: "el perro", verdict: "know" },
    ]);
    expect(summary.knowCount).toBe(3);
    expect(summary.dontKnowCount).toBe(0);
  });

  it("returns empty groups for a session with no classifications", () => {
    expect(summarizeDeckPractice([])).toEqual({ knowCount: 0, dontKnowCount: 0, know: [], dontKnow: [] });
  });
});
