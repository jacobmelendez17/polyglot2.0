import { describe, expect, it } from "vitest";

import { hashSourceValue } from "./source-hash";
import {
  createEntryKeyDisambiguator,
  projectWiktextractRecord,
} from "./wiktextract-adapter";
import { wiktextractRecordSchema } from "./wiktextract-schema";

/**
 * Spec 12's import fixture list, exercised against the adapter directly:
 * simple noun, multi-sense noun, verb/forms, pronunciation, synonyms,
 * homonym, multiword phrase, accent pair, malformed row, missing optional
 * fields.
 */

function project(raw: unknown) {
  const parsed = wiktextractRecordSchema.safeParse(raw);
  if (!parsed.success) return { valid: false as const, record: null };
  return {
    valid: true as const,
    record: projectWiktextractRecord(parsed.data),
  };
}

describe("wiktextract validation", () => {
  it("rejects a record with no headword", () => {
    expect(
      wiktextractRecordSchema.safeParse({ lang_code: "es", pos: "noun" })
        .success,
    ).toBe(false);
  });

  it("rejects an absurdly long field rather than storing it", () => {
    const parsed = wiktextractRecordSchema.safeParse({
      word: "x".repeat(1000),
      lang_code: "es",
      pos: "noun",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an oversized nested array", () => {
    const parsed = wiktextractRecordSchema.safeParse({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: Array.from({ length: 500 }, () => ({ glosses: ["x"] })),
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps unmodelled upstream fields instead of stripping them", () => {
    const parsed = wiktextractRecordSchema.parse({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["father"] }],
      etymology_text: "From Latin pater.",
    });
    // The complete upstream object is what lands in raw_data; silently
    // dropping fields here would lose exactly the history that column exists for.
    expect((parsed as Record<string, unknown>).etymology_text).toBe(
      "From Latin pater.",
    );
  });
});

describe("projectWiktextractRecord", () => {
  it("projects a simple noun", () => {
    const { record } = project({
      word: "libro",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["book"] }],
    });
    expect(record).not.toBeNull();
    expect(record!.lemma).toBe("libro");
    expect(record!.normalizedLemma).toBe("libro");
    expect(record!.partOfSpeech).toBe("noun");
    expect(record!.senses).toHaveLength(1);
    expect(record!.senses[0].gloss).toBe("book");
  });

  it("keeps multi-sense order and gives each sense a stable key", () => {
    const { record } = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [
        { glosses: ["father"], id: "padre-es-noun-father" },
        { glosses: ["priest"], id: "padre-es-noun-priest" },
        { glosses: ["founder"], id: "padre-es-noun-founder" },
      ],
    });
    expect(record!.senses.map((sense) => sense.senseOrder)).toEqual([0, 1, 2]);
    expect(record!.senses.map((sense) => sense.sourceSenseKey)).toEqual([
      "padre-es-noun-father",
      "padre-es-noun-priest",
      "padre-es-noun-founder",
    ]);
  });

  it("keys a sense by its gloss when the source supplies no id, so inserting a sense upstream does not re-key the rest", () => {
    const first = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["father"] }, { glosses: ["priest"] }],
    }).record!;
    const afterUpstreamInsertion = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [
        { glosses: ["male parent"] },
        { glosses: ["father"] },
        { glosses: ["priest"] },
      ],
    }).record!;

    const keyFor = (record: typeof first, gloss: string) =>
      record.senses.find((sense) => sense.gloss === gloss)?.sourceSenseKey;
    expect(keyFor(afterUpstreamInsertion, "father")).toBe(
      keyFor(first, "father"),
    );
    expect(keyFor(afterUpstreamInsertion, "priest")).toBe(
      keyFor(first, "priest"),
    );
  });

  it("changes a sense fingerprint when its content changes, but not when only its position does", () => {
    const before = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["father"], id: "s1" }],
    }).record!;
    const reordered = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [
        { glosses: ["priest"], id: "s2" },
        { glosses: ["father"], id: "s1" },
      ],
    }).record!;
    const reworded = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["dad"], id: "s1" }],
    }).record!;

    const fingerprintFor = (record: typeof before, key: string) =>
      record.senses.find((sense) => sense.sourceSenseKey === key)
        ?.sourceFingerprint;
    expect(fingerprintFor(reordered, "s1")).toBe(fingerprintFor(before, "s1"));
    expect(fingerprintFor(reworded, "s1")).not.toBe(
      fingerprintFor(before, "s1"),
    );
  });

  it("projects verb forms with their tags", () => {
    const { record } = project({
      word: "hablar",
      lang_code: "es",
      pos: "verb",
      senses: [{ glosses: ["to speak"] }],
      forms: [
        { form: "hablo", tags: ["first-person", "singular", "present"] },
        { form: "hablado", tags: ["participle"] },
      ],
    });
    expect(record!.partOfSpeech).toBe("verb");
    expect(record!.forms.map((form) => form.form)).toEqual([
      "hablo",
      "hablado",
    ]);
    expect(record!.forms[0].normalizedForm).toBe("hablo");
    expect(record!.forms[0].tags).toEqual([
      "first-person",
      "singular",
      "present",
    ]);
  });

  it("projects pronunciations, attaching a region code only when the source labels one", () => {
    const { record } = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["father"] }],
      sounds: [
        { ipa: "/ˈpa.dɾe/" },
        { ipa: "[ˈpa.ðɾe]", tags: ["Mexico"] },
        { audio: "es-padre.ogg", ogg_url: "https://example.invalid/a.ogg" },
      ],
    });
    expect(record!.pronunciations).toHaveLength(3);
    expect(record!.pronunciations[0].regionCode).toBeNull();
    expect(record!.pronunciations[1].regionCode).toBe("es-MX");
    expect(record!.pronunciations[2].audioUrl).toBe(
      "https://example.invalid/a.ogg",
    );
  });

  it("skips a sound entry carrying neither a transcription nor audio", () => {
    const { record } = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["father"] }],
      sounds: [{ tags: ["Mexico"] }],
    });
    expect(record!.pronunciations).toHaveLength(0);
  });

  it("projects each relationship field onto its relation type", () => {
    const { record } = project({
      word: "padre",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["father"] }],
      synonyms: [{ word: "papá" }, { word: "progenitor" }],
      antonyms: [{ word: "hijo" }],
      hypernyms: [{ word: "pariente" }],
    });
    const byType = (type: string) =>
      record!.relations
        .filter((relation) => relation.relationType === type)
        .map((r) => r.targetLemma);
    expect(byType("synonym")).toEqual(["papá", "progenitor"]);
    expect(byType("antonym")).toEqual(["hijo"]);
    expect(byType("hypernym")).toEqual(["pariente"]);
  });

  it("keeps a homonym pair as two entries by folding etymology into the entry key", () => {
    const first = project({
      word: "coma",
      lang_code: "es",
      pos: "noun",
      etymology_number: 1,
      senses: [{ glosses: ["comma"] }],
    }).record!;
    const second = project({
      word: "coma",
      lang_code: "es",
      pos: "noun",
      etymology_number: 2,
      senses: [{ glosses: ["coma"] }],
    }).record!;
    expect(first.sourceEntryKey).not.toBe(second.sourceEntryKey);
  });

  it("keeps an accent pair as two distinct entries", () => {
    const article = project({
      word: "el",
      lang_code: "es",
      pos: "article",
      senses: [{ glosses: ["the"] }],
    }).record!;
    const pronoun = project({
      word: "él",
      lang_code: "es",
      pos: "pron",
      senses: [{ glosses: ["he"] }],
    }).record!;
    expect(article.normalizedLemma).toBe("el");
    expect(pronoun.normalizedLemma).toBe("él");
    expect(article.sourceEntryKey).not.toBe(pronoun.sourceEntryKey);
  });

  it("projects a multiword expression whole, never split into words", () => {
    const { record } = project({
      word: "buenos días",
      lang_code: "es",
      pos: "phrase",
      senses: [{ glosses: ["good morning"] }],
    });
    expect(record!.normalizedLemma).toBe("buenos días");
    expect(record!.forms).toHaveLength(0);
  });

  it("records a region restriction stated by the source's own usage labels", () => {
    const { record } = project({
      word: "ordenador",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["computer"], tags: ["masculine", "Spain"] }],
    });
    expect(record!.restrictedRegionCodes).toEqual(["es-ES"]);
  });

  it("leaves restricted regions empty for an ordinary entry", () => {
    const { record } = project({
      word: "libro",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["book"] }],
    });
    expect(record!.restrictedRegionCodes).toEqual([]);
  });

  it("rejects a record whose part of speech cannot be mapped", () => {
    const { record } = project({
      word: "algo",
      lang_code: "es",
      pos: "totally-unknown-pos",
      senses: [{ glosses: ["something"] }],
    });
    expect(record).toBeNull();
  });

  it("rejects a record with no glossed sense — an entry with no meaning is not usable", () => {
    const { record } = project({
      word: "hablando",
      lang_code: "es",
      pos: "verb",
      senses: [{ tags: ["participle"] }],
    });
    expect(record).toBeNull();
  });

  it("accepts a record carrying only the required fields", () => {
    const { record } = project({
      word: "libro",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["book"] }],
    });
    expect(record).not.toBeNull();
    expect(record!.forms).toEqual([]);
    expect(record!.pronunciations).toEqual([]);
    expect(record!.relations).toEqual([]);
  });

  it("hashes the whole record so an unchanged reimport is recognizable", () => {
    const raw = {
      word: "libro",
      lang_code: "es",
      pos: "noun",
      senses: [{ glosses: ["book"] }],
    };
    const a = project(raw).record!;
    const b = project({
      pos: "noun",
      senses: [{ glosses: ["book"] }],
      lang_code: "es",
      word: "libro",
    }).record!;
    // Key order upstream is not a content change.
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.sourceHash).toBe(hashSourceValue(raw));
  });
});

describe("createEntryKeyDisambiguator", () => {
  it("leaves a key that appears once untouched", () => {
    const disambiguate = createEntryKeyDisambiguator();
    expect(disambiguate("casa#noun#0")).toBe("casa#noun#0");
  });

  it("suffixes repeats so a batch write can never touch one row twice", () => {
    // The real case: English Wiktionary has three "naranja" noun records
    // with no etymology number — the fruit, the colour, and a supporter of
    // a Spanish political party. All three arrive as `naranja#noun#0`, and
    // before this they failed the whole import with Postgres 21000.
    const disambiguate = createEntryKeyDisambiguator();
    expect(disambiguate("naranja#noun#0")).toBe("naranja#noun#0");
    expect(disambiguate("naranja#noun#0")).toBe("naranja#noun#0#2");
    expect(disambiguate("naranja#noun#0")).toBe("naranja#noun#0#3");
  });

  it("keeps unrelated keys independent", () => {
    const disambiguate = createEntryKeyDisambiguator();
    expect(disambiguate("dos#noun#0")).toBe("dos#noun#0");
    expect(disambiguate("dos#numeral#0")).toBe("dos#numeral#0");
    expect(disambiguate("dos#noun#0")).toBe("dos#noun#0#2");
  });

  it("cannot produce a key an etymology number could produce naturally", () => {
    // A natural key is exactly three segments, so a fourth segment is
    // unreachable upstream — `naranja#noun#2` (etymology 2) and
    // `naranja#noun#0#2` (second occurrence) are always distinct entries.
    const disambiguate = createEntryKeyDisambiguator();
    disambiguate("naranja#noun#0");
    expect(disambiguate("naranja#noun#0")).not.toBe("naranja#noun#2");
  });

  it("does not share state between imports", () => {
    expect(createEntryKeyDisambiguator()("casa#noun#0")).toBe("casa#noun#0");
    expect(createEntryKeyDisambiguator()("casa#noun#0")).toBe("casa#noun#0");
  });
});

describe("etymology numbers as they actually arrive", () => {
  it("accepts the numeric string the real Kaikki extract emits", () => {
    // Every one of the 10,173 Spanish records carrying this field uses a
    // string. Rejecting them dropped `hermano`, `hermana` and `persona`
    // (among thousands) from a real import without a word of warning.
    const parsed = wiktextractRecordSchema.safeParse({
      word: "hermano",
      lang_code: "es",
      pos: "noun",
      etymology_number: "1",
      senses: [{ glosses: ["brother"] }],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(projectWiktextractRecord(parsed.data)?.sourceEntryKey).toBe(
      "hermano#noun#1",
    );
  });

  it("still accepts a real number", () => {
    const parsed = wiktextractRecordSchema.safeParse({
      word: "hermano",
      lang_code: "es",
      pos: "noun",
      etymology_number: 2,
      senses: [{ glosses: ["brother"] }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(projectWiktextractRecord(parsed.data)?.sourceEntryKey).toBe(
      "hermano#noun#2",
    );
  });

  it("rejects a non-numeric string rather than silently treating it as etymology 0", () => {
    const parsed = wiktextractRecordSchema.safeParse({
      word: "hermano",
      lang_code: "es",
      pos: "noun",
      etymology_number: "first",
      senses: [{ glosses: ["brother"] }],
    });
    expect(parsed.success).toBe(false);
  });
});
