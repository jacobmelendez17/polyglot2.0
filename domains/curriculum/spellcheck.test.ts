import { describe, expect, it } from "vitest";

import { levenshteinDistance, suggestSpellingCorrection } from "./spellcheck";

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("gato", "gato")).toBe(0);
  });

  it("counts a single substitution", () => {
    expect(levenshteinDistance("gato", "gata")).toBe(1);
  });

  it("counts a single insertion/deletion", () => {
    expect(levenshteinDistance("si", "sí")).toBe(1); // "sí" adds an accented character
    expect(levenshteinDistance("gat", "gato")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("", "gato")).toBe(4);
    expect(levenshteinDistance("gato", "")).toBe(4);
  });
});

describe("suggestSpellingCorrection", () => {
  const lemmas = ["gato", "perro", "cámara", "comer", "biblioteca"];

  it("returns null when the term is already a known lemma", () => {
    expect(suggestSpellingCorrection("gato", lemmas)).toBeNull();
  });

  it("suggests the nearest known lemma for a one-letter typo", () => {
    expect(suggestSpellingCorrection("gata", lemmas)).toBe("gato");
  });

  it("suggests an accented lemma for its unaccented typo — accents are not treated as interchangeable, but a suggestion may still cross that boundary (spec §12)", () => {
    expect(suggestSpellingCorrection("camara", lemmas)).toBe("cámara");
  });

  it("never suggests across a short (2-letter) word — too many real Spanish accent-only pairs live there (mi/mí, tu/tú, el/él, si/sí) to warn safely", () => {
    expect(suggestSpellingCorrection("si", ["sí", "perro"])).toBeNull();
  });

  it("returns null when nothing is close enough", () => {
    expect(suggestSpellingCorrection("aeropuerto", lemmas)).toBeNull();
  });

  it("returns null for terms shorter than the minimum checkable length", () => {
    expect(suggestSpellingCorrection("y", lemmas)).toBeNull();
    expect(suggestSpellingCorrection("el", lemmas)).toBeNull();
  });

  it("allows a larger edit distance for longer words", () => {
    // "biblioteca" (10 chars) vs "bibloteca" (9 chars, missing one letter) — distance 1, well within range.
    expect(suggestSpellingCorrection("bibloteca", lemmas)).toBe("biblioteca");
  });

  it("returns null against an empty corpus", () => {
    expect(suggestSpellingCorrection("gata", [])).toBeNull();
  });
});
