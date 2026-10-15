import { describe, expect, it } from "vitest";

import {
  applyDictionaryFilterChange,
  dictionaryListCodec,
  hasActiveDictionaryFilters,
  parseDictionaryListParams,
  serializeDictionaryListParams,
  type DictionaryListFilters,
  type DictionaryListLookups,
} from "./dictionary-list-params";

const LOOKUPS: DictionaryListLookups = {
  languages: [{ id: "lang-es" }, { id: "lang-fr" }],
  levels: [{ id: "level-1" }, { id: "level-2" }],
  groups: [{ id: "group-1a" }, { id: "group-2a" }],
  regionCodes: ["es-MX", "es"],
};

const parse = (search: string) =>
  parseDictionaryListParams(new URLSearchParams(search), LOOKUPS);

describe("parseDictionaryListParams", () => {
  it("reads every filter and the offset the page always took", () => {
    expect(
      parse(
        "language=lang-es&level=level-1&group=group-1a&status=review_required&pos=verb&region=es&regional=not_listed&offset=50",
      ),
    ).toEqual({
      filters: {
        language: "lang-es",
        level: "level-1",
        group: "group-1a",
        status: "review_required",
        pos: "verb",
        region: "es",
        regional: "not_listed",
      },
      offset: 50,
    });
  });

  it("falls back to the first language for an unknown or missing one", () => {
    expect(parse("").filters.language).toBe("lang-es");
    expect(parse("language=lang-xx").filters.language).toBe("lang-es");
    expect(parse("language=lang-fr").filters.language).toBe("lang-fr");
  });

  it("drops what it cannot honour — never forwarding another language's level or group, or an unknown value", () => {
    expect(
      parse(
        "language=lang-es&level=other-lang-level&group=other-lang-group&status=done&pos=interjection&region=xx&regional=maybe",
      ).filters,
    ).toEqual({ language: "lang-es" });
  });

  it("reads an offset as a whole page, never negative or not a number", () => {
    expect(parse("offset=0").offset).toBe(0);
    expect(parse("offset=25").offset).toBe(25);
    // An address naming the middle of a page names the page it is on.
    expect(parse("offset=60").offset).toBe(50);
    expect(parse("offset=-25").offset).toBe(0);
    expect(parse("offset=lots").offset).toBe(0);
    expect(parse("offset=").offset).toBe(0);
  });
});

describe("serializeDictionaryListParams", () => {
  it("writes the page's own parameters in the page's own order, omitting what is empty", () => {
    const filters: DictionaryListFilters = {
      regional: "recognized",
      region: "es-MX",
      pos: "noun",
      status: "unmatched",
      group: "group-1a",
      level: "level-1",
      language: "lang-es",
    };
    expect(serializeDictionaryListParams(filters, 75).toString()).toBe(
      "language=lang-es&level=level-1&group=group-1a&status=unmatched&pos=noun&region=es-MX&regional=recognized&offset=75",
    );
    expect(
      serializeDictionaryListParams({ language: "lang-es" }).toString(),
    ).toBe("language=lang-es");
  });

  it("does not write an offset for the first page", () => {
    expect(
      serializeDictionaryListParams({ language: "lang-es" }, 0).toString(),
    ).toBe("language=lang-es");
  });

  it("round-trips what it parses", () => {
    const state = parse(
      "language=lang-es&level=level-2&status=manual&regional=unknown&offset=25",
    );
    expect(
      serializeDictionaryListParams(state.filters, state.offset).toString(),
    ).toBe(
      "language=lang-es&level=level-2&status=manual&regional=unknown&offset=25",
    );
  });
});

describe("applyDictionaryFilterChange", () => {
  const previous: DictionaryListFilters = {
    language: "lang-es",
    level: "level-1",
    group: "group-1a",
    status: "unmatched",
    region: "es",
  };

  it("clears level, group and region when the language changes — they belonged to the old one", () => {
    expect(
      applyDictionaryFilterChange(previous, {
        language: "lang-fr",
        level: "level-1",
        group: "group-1a",
        status: "unmatched",
      }),
    ).toEqual({ language: "lang-fr", status: "unmatched" });
  });

  it("clears the group when the level changes, but keeps it otherwise", () => {
    expect(
      applyDictionaryFilterChange(previous, {
        language: "lang-es",
        level: "level-2",
        group: "group-1a",
      }),
    ).toMatchObject({ level: "level-2", group: undefined });
    expect(
      applyDictionaryFilterChange(previous, {
        language: "lang-es",
        level: "level-1",
        group: "group-1a",
      }),
    ).toMatchObject({ level: "level-1", group: "group-1a" });
  });

  it("keeps the region, which is not an input of the form, and takes a regional status", () => {
    expect(
      applyDictionaryFilterChange(previous, {
        language: "lang-es",
        level: "level-1",
        group: "group-1a",
        regional: "recognized",
      }),
    ).toMatchObject({ region: "es", regional: "recognized" });
  });

  it("never lets the mandatory language be emptied, and ignores values outside a whitelist", () => {
    expect(
      applyDictionaryFilterChange(previous, {
        language: "",
        status: "done",
        pos: "interjection",
        regional: "maybe",
        search: "gato",
      }),
    ).toEqual({ language: "lang-es", region: "es" });
  });
});

describe("hasActiveDictionaryFilters", () => {
  it("is true for any filter beyond the language, and for none of its own region", () => {
    expect(hasActiveDictionaryFilters({ language: "lang-es" })).toBe(false);
    expect(
      hasActiveDictionaryFilters({ language: "lang-es", region: "es" }),
    ).toBe(false);
    for (const filters of [
      { language: "lang-es", level: "level-1" },
      { language: "lang-es", group: "group-1a" },
      { language: "lang-es", status: "manual" as const },
      { language: "lang-es", pos: "verb" as const },
      { language: "lang-es", regional: "unknown" as const },
    ]) {
      expect(hasActiveDictionaryFilters(filters)).toBe(true);
    }
  });
});

describe("dictionaryListCodec", () => {
  it("is the three functions above, bound to the lookups", () => {
    const codec = dictionaryListCodec(LOOKUPS);
    expect(
      codec.parse(new URLSearchParams("language=lang-fr")).filters.language,
    ).toBe("lang-fr");
    expect(codec.serialize({ language: "lang-es" }, 25).toString()).toBe(
      "language=lang-es&offset=25",
    );
  });
});
