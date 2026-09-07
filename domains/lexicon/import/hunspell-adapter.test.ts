import { describe, expect, it } from "vitest";

import { parseHunspellDictionary, parseHunspellEncoding, toBufferEncoding } from "./hunspell-adapter";

describe("parseHunspellEncoding", () => {
  it("reads the SET declaration", () => {
    expect(parseHunspellEncoding("SET UTF-8\nTRY esiaonr\n")).toBe("UTF-8");
    expect(parseHunspellEncoding("# comment\nSET ISO8859-1\n")).toBe("ISO8859-1");
  });

  it("defaults to UTF-8 when no encoding is declared", () => {
    expect(parseHunspellEncoding("TRY esiaonr\n")).toBe("UTF-8");
  });

  it("maps declarations onto Node buffer encodings", () => {
    // Getting this wrong silently mangles exactly the accented characters
    // the whole normalization rule exists to protect.
    expect(toBufferEncoding("UTF-8")).toBe("utf8");
    expect(toBufferEncoding("ISO8859-1")).toBe("latin1");
    expect(toBufferEncoding("LATIN1")).toBe("latin1");
    expect(toBufferEncoding("SOMETHING-ELSE")).toBe("utf8");
  });
});

describe("parseHunspellDictionary", () => {
  it("skips the leading entry count", () => {
    const entries = parseHunspellDictionary("3\npadre\nmadre\ngato\n");
    expect(entries.map((entry) => entry.word)).toEqual(["padre", "madre", "gato"]);
  });

  it("splits affix flags from the headword", () => {
    const [entry] = parseHunspellDictionary("1\nordenador/S\n");
    expect(entry.word).toBe("ordenador");
    expect(entry.affixFlags).toBe("S");
  });

  it("treats an escaped slash as part of the word", () => {
    const [entry] = parseHunspellDictionary("1\nkm\\/h\n");
    expect(entry.word).toBe("km/h");
    expect(entry.affixFlags).toBeNull();
  });

  it("drops morphological fields that follow whitespace", () => {
    const [entry] = parseHunspellDictionary("1\npadre po:noun is:masc\n");
    expect(entry.word).toBe("padre");
  });

  it("ignores comments and blank lines", () => {
    const entries = parseHunspellDictionary("2\n# a comment\n\npadre\nmadre\n");
    expect(entries.map((entry) => entry.word)).toEqual(["padre", "madre"]);
  });

  it("normalizes each word for lookup while keeping the original spelling", () => {
    const entries = parseHunspellDictionary("2\ndías\nDía\n");
    expect(entries[0]).toEqual({ word: "días", normalizedWord: "días", affixFlags: null });
    expect(entries[1]).toEqual({ word: "Día", normalizedWord: "día", affixFlags: null });
  });

  it("preserves accents, so an accented and unaccented pair stay distinct entries", () => {
    const entries = parseHunspellDictionary("2\nel\nél\n");
    expect(entries[0].normalizedWord).toBe("el");
    expect(entries[1].normalizedWord).toBe("él");
  });

  it("handles a file with no leading count", () => {
    const entries = parseHunspellDictionary("padre\nmadre\n");
    expect(entries.map((entry) => entry.word)).toEqual(["padre", "madre"]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseHunspellDictionary("")).toEqual([]);
  });
});
