import { describe, expect, it } from "vitest";

import { checkAnswer } from "./check-answer";

describe("checkAnswer", () => {
  it("accepts an exact match", () => {
    expect(checkAnswer({ userAnswer: "cat", acceptedAnswers: ["cat"] })).toEqual({ isCorrect: true });
  });

  it("is case and whitespace insensitive", () => {
    expect(checkAnswer({ userAnswer: "  Cat  ", acceptedAnswers: ["cat"] })).toEqual({ isCorrect: true });
  });

  it("does not erase meaningful diacritics", () => {
    expect(checkAnswer({ userAnswer: "si", acceptedAnswers: ["sí"] })).toEqual({
      isCorrect: false,
      reason: "no_match",
    });
  });

  it("accepts any configured synonym", () => {
    const result = checkAnswer({ userAnswer: "kitty", acceptedAnswers: ["cat", "kitty", "kitten"] });
    expect(result).toEqual({ isCorrect: true });
  });

  it("tolerates a single-character typo on longer words", () => {
    expect(checkAnswer({ userAnswer: "aprendr", acceptedAnswers: ["aprender"] })).toEqual({ isCorrect: true });
  });

  it("does not tolerate typos on short words", () => {
    expect(checkAnswer({ userAnswer: "y", acceptedAnswers: ["o"] })).toEqual({
      isCorrect: false,
      reason: "no_match",
    });
  });

  it("rejects an answer more than one edit away", () => {
    expect(checkAnswer({ userAnswer: "aprnedar", acceptedAnswers: ["aprender"] })).toEqual({
      isCorrect: false,
      reason: "no_match",
    });
  });

  it("requires the article for English to Spanish", () => {
    const result = checkAnswer({
      userAnswer: "el gato",
      acceptedAnswers: ["el gato"],
      articleRequirement: { article: "el", bareAnswers: ["gato"] },
    });
    expect(result).toEqual({ isCorrect: true });
  });

  it("marks a bare noun missing its required article as incorrect with a specific reason", () => {
    const result = checkAnswer({
      userAnswer: "gato",
      acceptedAnswers: ["el gato"],
      articleRequirement: { article: "el", bareAnswers: ["gato"] },
    });
    expect(result).toEqual({ isCorrect: false, reason: "missing_article", article: "el" });
  });

  it("does not require an article for Spanish to English (no articleRequirement passed)", () => {
    const result = checkAnswer({ userAnswer: "cat", acceptedAnswers: ["cat"] });
    expect(result).toEqual({ isCorrect: true });
  });

  it("does not accept an unrelated wrong answer as a missing-article case", () => {
    const result = checkAnswer({
      userAnswer: "perro",
      acceptedAnswers: ["el gato"],
      articleRequirement: { article: "el", bareAnswers: ["gato"] },
    });
    expect(result).toEqual({ isCorrect: false, reason: "no_match" });
  });
});
