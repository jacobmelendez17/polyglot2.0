import { describe, expect, it } from "vitest";

import { importListCodec } from "./imports-list-params";

const LOOKUPS = { languages: [{ id: "lang-es" }, { id: "lang-fr" }] };
const parse = (query: string, archived: boolean) =>
  importListCodec(LOOKUPS, archived).parse(new URLSearchParams(query));

describe("importListCodec — the normal history", () => {
  const codec = importListCodec(LOOKUPS, false);

  it("reads the language and the cursor from the URL, and asks for no archive", () => {
    expect(parse("language=lang-fr&cursor=abc", false)).toEqual({
      filters: { language: "lang-fr" },
      cursor: "abc",
    });
  });

  it("falls back to the first language, as the pages always did", () => {
    expect(parse("", false).filters).toEqual({ language: "lang-es" });
    expect(parse("language=nope", false).filters.language).toBe("lang-es");
  });

  it("writes the language and the cursor, in a fixed order", () => {
    expect(codec.serialize({ language: "lang-es" }, "after-2").toString()).toBe(
      "language=lang-es&cursor=after-2",
    );
  });

  it("starts again from the first page when the language changes", () => {
    expect(
      codec.applyChange({ language: "lang-es" }, { language: "lang-fr" }),
    ).toEqual({ language: "lang-fr" });
  });

  it("can never be emptied of its language", () => {
    expect(
      codec.applyChange({ language: "lang-es" }, { language: "" }),
    ).toEqual({ language: "lang-es" });
  });
});

describe("importListCodec — the archived history", () => {
  const codec = importListCodec(LOOKUPS, true);

  it("asks the endpoint for the archive, whatever the address says", () => {
    expect(parse("language=lang-fr", true).filters).toEqual({
      language: "lang-fr",
      archived: "true",
    });
    // The route decides, so a pasted `archived=false` changes nothing.
    expect(
      parse("language=lang-fr&archived=false", true).filters.archived,
    ).toBe("true");
    expect(parse("language=lang-fr&archived=true", false).filters).toEqual({
      language: "lang-fr",
    });
  });

  it("never writes the history into the address — it is the route", () => {
    expect(
      codec
        .serialize({ language: "lang-es", archived: "true" }, "c1")
        .toString(),
    ).toBe("language=lang-es&cursor=c1");
  });

  it("keeps asking for the archive when the language changes", () => {
    expect(
      codec.applyChange(
        { language: "lang-es", archived: "true" },
        { language: "lang-fr" },
      ),
    ).toEqual({ language: "lang-fr", archived: "true" });
  });
});
