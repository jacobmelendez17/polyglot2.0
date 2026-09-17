import { describe, expect, it } from "vitest";

import {
  isMultiwordForm,
  normalizeLexicalForm,
  normalizePartOfSpeech,
} from "./lexical-normalization";

describe("normalizeLexicalForm", () => {
  it("trims, collapses whitespace, and folds case", () => {
    expect(normalizeLexicalForm("  El   Padre  ")).toBe("el padre");
    expect(normalizeLexicalForm("GATO")).toBe("gato");
  });

  it("normalizes decomposed Unicode to the precomposed form", () => {
    // "día" written as d + i + a + combining acute, versus the precomposed í.
    const decomposed = "día";
    const precomposed = "día";
    expect(decomposed).not.toBe(precomposed);
    expect(normalizeLexicalForm(decomposed)).toBe(
      normalizeLexicalForm(precomposed),
    );
    expect(normalizeLexicalForm(decomposed)).toBe("día");
  });

  it("never removes accents or diacritics", () => {
    // Spec 12's explicit list — each pair must stay two different terms.
    expect(normalizeLexicalForm("el")).not.toBe(normalizeLexicalForm("él"));
    expect(normalizeLexicalForm("tu")).not.toBe(normalizeLexicalForm("tú"));
    expect(normalizeLexicalForm("si")).not.toBe(normalizeLexicalForm("sí"));
    expect(normalizeLexicalForm("como")).not.toBe(normalizeLexicalForm("cómo"));
  });

  it("preserves ñ and other Spanish letters rather than folding them to ASCII", () => {
    expect(normalizeLexicalForm("Año")).toBe("año");
    expect(normalizeLexicalForm("año")).not.toBe(normalizeLexicalForm("ano"));
  });

  it("normalizes typographic punctuation without deleting meaningful characters", () => {
    expect(normalizeLexicalForm("d’acord")).toBe("d'acord");
    expect(normalizeLexicalForm("a–b")).toBe("a-b");
    expect(normalizeLexicalForm("buenos días")).toBe("buenos días");
    // Spanish inverted punctuation is meaningful and must survive.
    expect(normalizeLexicalForm("¿Cómo?")).toBe("¿cómo?");
  });

  it("agrees with the normalization curriculum duplicate detection already uses", () => {
    // architecture.md's duplicate rule: Gato/gato/" GATO " are the same term.
    expect(normalizeLexicalForm("Gato")).toBe(normalizeLexicalForm(" GATO "));
  });
});

describe("normalizePartOfSpeech", () => {
  it("maps source tags and admin-typed labels onto the same value", () => {
    expect(normalizePartOfSpeech("noun")).toBe("noun");
    expect(normalizePartOfSpeech("Noun")).toBe("noun");
    expect(normalizePartOfSpeech("sustantivo")).toBe("noun");
    expect(normalizePartOfSpeech("adj")).toBe("adjective");
    expect(normalizePartOfSpeech("adjective")).toBe("adjective");
    expect(normalizePartOfSpeech("article")).toBe("determiner");
    expect(normalizePartOfSpeech("phrase")).toBe("phrase");
  });

  it("returns null for anything unrecognized rather than guessing", () => {
    expect(normalizePartOfSpeech("wibble")).toBeNull();
    expect(normalizePartOfSpeech("")).toBeNull();
    expect(normalizePartOfSpeech(null)).toBeNull();
    expect(normalizePartOfSpeech(undefined)).toBeNull();
  });
});

describe("isMultiwordForm", () => {
  it("detects expressions, ignoring incidental whitespace", () => {
    expect(isMultiwordForm("buenos días")).toBe(true);
    expect(isMultiwordForm("  padre  ")).toBe(false);
    expect(isMultiwordForm("el padre")).toBe(true);
  });
});
