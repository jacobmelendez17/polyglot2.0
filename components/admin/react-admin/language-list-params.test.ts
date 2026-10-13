import { describe, expect, it } from "vitest";

import {
  applyLanguageFilterChange,
  parseLanguageListParams,
  serializeLanguageListParams,
} from "./language-list-params";

const LOOKUPS = { languages: [{ id: "lang-es" }, { id: "lang-fr" }] };
const parse = (query: string) =>
  parseLanguageListParams(new URLSearchParams(query), LOOKUPS);

describe("parseLanguageListParams", () => {
  it("reads the language and the cursor from the URL", () => {
    expect(parse("language=lang-fr&cursor=abc")).toEqual({
      filters: { language: "lang-fr" },
      cursor: "abc",
    });
  });

  it("falls back to the first language when none is given", () => {
    expect(parse("").filters.language).toBe("lang-es");
  });

  it("falls back to the first language for one that does not exist", () => {
    expect(parse("language=not-a-language").filters.language).toBe("lang-es");
  });

  it("treats an empty cursor as no cursor", () => {
    expect(parse("language=lang-es&cursor=").cursor).toBeUndefined();
  });

  it("has no language at all when there are no languages to choose from", () => {
    expect(
      parseLanguageListParams(new URLSearchParams("language=lang-es"), {
        languages: [],
      }).filters.language,
    ).toBe("");
  });
});

describe("serializeLanguageListParams", () => {
  it("writes the language, then the cursor, in a fixed order", () => {
    expect(
      serializeLanguageListParams(
        { language: "lang-es" },
        "after-2",
      ).toString(),
    ).toBe("language=lang-es&cursor=after-2");
  });

  it("omits what is empty", () => {
    expect(
      serializeLanguageListParams({ language: "lang-es" }).toString(),
    ).toBe("language=lang-es");
    expect(serializeLanguageListParams({ language: "" }).toString()).toBe("");
  });

  it("round-trips through parse", () => {
    const written = serializeLanguageListParams({ language: "lang-fr" }, "c1");
    expect(parse(written.toString())).toEqual({
      filters: { language: "lang-fr" },
      cursor: "c1",
    });
  });
});

describe("applyLanguageFilterChange", () => {
  it("switches language", () => {
    expect(
      applyLanguageFilterChange(
        { language: "lang-es" },
        { language: "lang-fr" },
      ),
    ).toEqual({ language: "lang-fr" });
  });

  it("can never empty the language", () => {
    for (const requested of [{}, { language: "" }, { language: null }]) {
      expect(
        applyLanguageFilterChange({ language: "lang-es" }, requested),
      ).toEqual({ language: "lang-es" });
    }
  });
});
