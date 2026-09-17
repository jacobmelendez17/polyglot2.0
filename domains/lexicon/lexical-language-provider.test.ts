import { describe, expect, it } from "vitest";

import { baseLanguageSubtag } from "@/lib/language-code";

import {
  composeVocabularyDisplayWord,
  defaultLexicalProvider,
  getLexicalLanguageProvider,
  spanishLexicalProvider,
} from "./lexical-language-provider";

describe("spanishLexicalProvider.deriveDictionaryLookups", () => {
  it("derives the lemma from an article-composed display word", () => {
    // Spec 12's own worked example.
    expect(spanishLexicalProvider.deriveDictionaryLookups("el padre")).toEqual([
      "el padre",
      "padre",
    ]);
    expect(spanishLexicalProvider.deriveDictionaryLookups("la madre")).toEqual([
      "la madre",
      "madre",
    ]);
  });

  it("puts the exact expression first, so phrase matching is always attempted before article removal", () => {
    expect(spanishLexicalProvider.deriveDictionaryLookups("el padre")[0]).toBe(
      "el padre",
    );
  });

  it("handles every article in the set, and only those", () => {
    for (const article of [
      "el",
      "la",
      "los",
      "las",
      "un",
      "una",
      "unos",
      "unas",
    ]) {
      expect(
        spanishLexicalProvider.deriveDictionaryLookups(`${article} cosa`),
      ).toEqual([`${article} cosa`, "cosa"]);
    }
  });

  it("does not blindly strip the first token of every phrase", () => {
    // Spec 12 is explicit about this: these are expressions, not article+noun.
    expect(
      spanishLexicalProvider.deriveDictionaryLookups("buenos días"),
    ).toEqual(["buenos días"]);
    expect(spanishLexicalProvider.deriveDictionaryLookups("por favor")).toEqual(
      ["por favor"],
    );
    expect(spanishLexicalProvider.deriveDictionaryLookups("de nada")).toEqual([
      "de nada",
    ]);
  });

  it("treats the accented pronoun él as a different word from the article el", () => {
    // Normalization preserves the accent precisely so this can't collapse.
    expect(spanishLexicalProvider.deriveDictionaryLookups("él")).toEqual([
      "él",
    ]);
    expect(spanishLexicalProvider.deriveDictionaryLookups("él padre")).toEqual([
      "él padre",
    ]);
  });

  it("never reduces a bare article to nothing", () => {
    expect(spanishLexicalProvider.deriveDictionaryLookups("el")).toEqual([
      "el",
    ]);
    expect(spanishLexicalProvider.deriveDictionaryLookups("las")).toEqual([
      "las",
    ]);
  });

  it("strips only the leading article from a longer expression, keeping the rest whole", () => {
    expect(
      spanishLexicalProvider.deriveDictionaryLookups("el fin de semana"),
    ).toEqual(["el fin de semana", "fin de semana"]);
  });

  it("normalizes the display word before deriving anything", () => {
    expect(
      spanishLexicalProvider.deriveDictionaryLookups("  El   Padre "),
    ).toEqual(["el padre", "padre"]);
  });

  it("returns nothing for an empty display word", () => {
    expect(spanishLexicalProvider.deriveDictionaryLookups("   ")).toEqual([]);
  });
});

describe("spanishLexicalProvider.regionCodeForSourceLabel", () => {
  it("maps source usage labels onto region codes", () => {
    expect(spanishLexicalProvider.regionCodeForSourceLabel("Mexico")).toBe(
      "es-MX",
    );
    expect(spanishLexicalProvider.regionCodeForSourceLabel("Spain")).toBe(
      "es-ES",
    );
    expect(spanishLexicalProvider.regionCodeForSourceLabel("Argentina")).toBe(
      "es-AR",
    );
  });

  it("returns null for a label that carries no regional meaning", () => {
    expect(
      spanishLexicalProvider.regionCodeForSourceLabel("masculine"),
    ).toBeNull();
    expect(
      spanishLexicalProvider.regionCodeForSourceLabel("colloquial"),
    ).toBeNull();
  });
});

describe("getLexicalLanguageProvider", () => {
  it("resolves a regional language code to its base language's provider", () => {
    // Polyglot's own languages.code is "es-MX" (domains/users provisioning).
    expect(getLexicalLanguageProvider("es-MX")).toBe(spanishLexicalProvider);
    expect(getLexicalLanguageProvider("es")).toBe(spanishLexicalProvider);
  });

  it("falls back to exact-match-only behavior for a language with no provider", () => {
    const provider = getLexicalLanguageProvider("ja");
    expect(provider).toBe(defaultLexicalProvider);
    // No other language's morphology is applied: nothing is stripped.
    expect(provider.deriveDictionaryLookups("el padre")).toEqual(["el padre"]);
    expect(provider.regionCodes).toEqual([]);
  });
});

describe("baseLanguageSubtag", () => {
  it("reduces a regional code to its language", () => {
    expect(baseLanguageSubtag("es-MX")).toBe("es");
    expect(baseLanguageSubtag("es")).toBe("es");
    expect(baseLanguageSubtag("PT-BR")).toBe("pt");
  });
});

describe("composeVocabularyDisplayWord", () => {
  it("composes the article the same way level cards do", () => {
    expect(composeVocabularyDisplayWord("padre", "el")).toBe("el padre");
    expect(composeVocabularyDisplayWord("rojo", null)).toBe("rojo");
    expect(composeVocabularyDisplayWord("rojo", undefined)).toBe("rojo");
  });
});

describe("grammaticalGenderForArticle", () => {
  it("derives Spanish gender from the article the noun is taught with (spec 18)", () => {
    expect(spanishLexicalProvider.grammaticalGenderForArticle("el")).toBe(
      "masculine",
    );
    expect(spanishLexicalProvider.grammaticalGenderForArticle("los")).toBe(
      "masculine",
    );
    expect(spanishLexicalProvider.grammaticalGenderForArticle("la")).toBe(
      "feminine",
    );
    expect(spanishLexicalProvider.grammaticalGenderForArticle("unas")).toBe(
      "feminine",
    );
  });

  it("returns null when there is no article, so the item page shows N/A rather than a guess", () => {
    expect(spanishLexicalProvider.grammaticalGenderForArticle(null)).toBeNull();
    expect(
      spanishLexicalProvider.grammaticalGenderForArticle(undefined),
    ).toBeNull();
    expect(spanishLexicalProvider.grammaticalGenderForArticle("")).toBeNull();
    // `él` is the pronoun, a different word — normalization preserves the accent precisely so it cannot match.
    expect(spanishLexicalProvider.grammaticalGenderForArticle("él")).toBeNull();
  });

  it("never applies one language's gender rules to a language with no provider", () => {
    expect(defaultLexicalProvider.grammaticalGenderForArticle("el")).toBeNull();
  });
});
