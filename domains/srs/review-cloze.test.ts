import { describe, expect, it } from "vitest";

import { findCompatibleClozeSentence } from "./review-cloze";

describe("findCompatibleClozeSentence", () => {
  it("finds a whole-word, case-insensitive match and blanks it", () => {
    const result = findCompatibleClozeSentence(
      [
        {
          id: "s",
          targetText: "El gato duerme.",
          translation: "The cat sleeps.",
        },
      ],
      "gato",
    );
    expect(result).toEqual({
      sentenceId: "s",
      sentenceBefore: "El ",
      sentenceAfter: " duerme.",
      blankedWord: "gato",
      translation: "The cat sleeps.",
    });
  });

  it("preserves the sentence's own casing for the blanked word rather than the search term's casing", () => {
    const result = findCompatibleClozeSentence(
      [{ id: "s", targetText: "Gato duerme.", translation: "Cat sleeps." }],
      "gato",
    );
    expect(result?.blankedWord).toBe("Gato");
  });

  it("does not match a substring inside a longer word (whole-word only)", () => {
    const result = findCompatibleClozeSentence(
      [
        {
          id: "s",
          targetText: "El gatito duerme.",
          translation: "The kitten sleeps.",
        },
      ],
      "gato",
    );
    expect(result).toBeNull();
  });

  it("matches correctly around accented Unicode letters, not ASCII \\b boundaries", () => {
    const result = findCompatibleClozeSentence(
      [
        {
          id: "s",
          targetText: "Bebo agua todos los días.",
          translation: "I drink water every day.",
        },
      ],
      "días",
    );
    expect(result).toEqual({
      sentenceId: "s",
      sentenceBefore: "Bebo agua todos los ",
      sentenceAfter: ".",
      blankedWord: "días",
      translation: "I drink water every day.",
    });
  });

  it("returns the first compatible sentence when multiple examples exist", () => {
    const result = findCompatibleClozeSentence(
      [
        {
          id: "s1",
          targetText: "No hay perro aquí.",
          translation: "There is no dog here.",
        },
        {
          id: "s2",
          targetText: "El gato duerme.",
          translation: "The cat sleeps.",
        },
        {
          id: "s3",
          targetText: "Otro gato come.",
          translation: "Another cat eats.",
        },
      ],
      "gato",
    );
    expect(result?.sentenceBefore).toBe("El ");
    expect(result?.sentenceId).toBe("s2");
  });

  it("returns null when no example is compatible", () => {
    const result = findCompatibleClozeSentence(
      [
        {
          id: "s",
          targetText: "El perro corre.",
          translation: "The dog runs.",
        },
      ],
      "gato",
    );
    expect(result).toBeNull();
  });

  it("returns null for an empty example list", () => {
    expect(findCompatibleClozeSentence([], "gato")).toBeNull();
  });
});
