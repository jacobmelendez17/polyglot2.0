import { describe, expect, it } from "vitest";

import {
  GROUPS_PATH,
  applyGroupFilterChange,
  groupsListHref,
  parseGroupListParams,
  reorderHref,
  serializeGroupListParams,
} from "./group-list-params";

const LANGUAGES = [{ id: "lang-es" }, { id: "lang-fr" }];
// The levels of the *selected* language.
const LEVELS = [{ id: "level-1" }, { id: "level-2" }];
const LOOKUPS = { languages: LANGUAGES, levels: LEVELS };

const parse = (query: string, lookups = LOOKUPS) =>
  parseGroupListParams(new URLSearchParams(query), lookups).filters;

describe("parseGroupListParams", () => {
  it("reads the language and the level from the URL", () => {
    expect(parse("language=lang-fr&level=level-2")).toEqual({
      language: "lang-fr",
      level: "level-2",
    });
  });

  it("falls back to the first language, and the language's first level, for a bare URL", () => {
    expect(parse("")).toEqual({ language: "lang-es", level: "level-1" });
  });

  it("falls back to the first language for an unknown one", () => {
    expect(parse("language=nope&level=level-2").language).toBe("lang-es");
  });

  it("falls back to the first level for an unknown one — never 'all levels'", () => {
    expect(parse("language=lang-es&level=nope").level).toBe("level-1");
  });

  it("treats a level of another language as unknown: the lookups are the selected language's", () => {
    expect(parse("language=lang-es&level=level-7").level).toBe("level-1");
  });

  it("has no level at all for a language that has none, and no language when there are none", () => {
    expect(
      parse("language=lang-es", { languages: LANGUAGES, levels: [] }),
    ).toEqual({ language: "lang-es", level: "" });
    expect(parse("", { languages: [], levels: [] })).toEqual({
      language: "",
      level: "",
    });
  });

  it("never reads a cursor — a level's groups are one bounded response", () => {
    expect(
      parseGroupListParams(
        new URLSearchParams("language=lang-es&level=level-1&cursor=abc"),
        LOOKUPS,
      ).cursor,
    ).toBeUndefined();
  });

  it("ignores the reorder mode, which is the page's business and not the list's", () => {
    expect(parse("language=lang-es&level=level-2&mode=reorder")).toEqual({
      language: "lang-es",
      level: "level-2",
    });
  });
});

describe("serializeGroupListParams", () => {
  it("writes language then level, in that order", () => {
    expect(
      serializeGroupListParams({
        language: "lang-es",
        level: "level-2",
      }).toString(),
    ).toBe("language=lang-es&level=level-2");
  });

  it("omits an empty value", () => {
    expect(
      serializeGroupListParams({ language: "lang-es", level: "" }).toString(),
    ).toBe("language=lang-es");
    expect(
      serializeGroupListParams({ language: "", level: "" }).toString(),
    ).toBe("");
  });
});

describe("applyGroupFilterChange", () => {
  const previous = { language: "lang-es", level: "level-1" };

  it("changes the level", () => {
    expect(
      applyGroupFilterChange(previous, {
        language: "lang-es",
        level: "level-2",
      }),
    ).toEqual({ language: "lang-es", level: "level-2" });
  });

  it("drops the level when the language changes — a level belongs to one language", () => {
    expect(
      applyGroupFilterChange(previous, {
        language: "lang-fr",
        // The form still holds the old language's level when it reports the change.
        level: "level-1",
      }),
    ).toEqual({ language: "lang-fr", level: "" });
  });

  it("keeps the level when only the language field is reported", () => {
    expect(applyGroupFilterChange(previous, { language: "lang-es" })).toEqual(
      previous,
    );
  });

  it("cannot empty either: there is no 'all languages' and no 'all levels'", () => {
    expect(
      applyGroupFilterChange(previous, { language: "", level: "" }),
    ).toEqual(previous);
    expect(
      applyGroupFilterChange(previous, { language: null, level: undefined }),
    ).toEqual(previous);
  });

  it("ignores keys it does not know, rather than forwarding them", () => {
    expect(
      applyGroupFilterChange(previous, {
        language: "lang-es",
        level: "level-2",
        status: "published",
        position: 3,
      }),
    ).toEqual({ language: "lang-es", level: "level-2" });
  });
});

describe("the links that carry the language and level", () => {
  it("builds the reorder tool's link for the same language and level", () => {
    expect(reorderHref({ language: "lang-es", level: "level-2" })).toBe(
      `${GROUPS_PATH}?language=lang-es&level=level-2&mode=reorder`,
    );
  });

  it("builds the list's link for a language and level — what a group page's 'back' points at", () => {
    expect(groupsListHref({ language: "lang-es", level: "level-2" })).toBe(
      `${GROUPS_PATH}?language=lang-es&level=level-2`,
    );
  });

  it("is just the page when there is nothing to carry", () => {
    expect(groupsListHref({ language: "", level: "" })).toBe(GROUPS_PATH);
  });
});
