import { describe, expect, it } from "vitest";

import {
  applyCurriculumFilterChange,
  hasActiveFilters,
  parseCurriculumListParams,
  sameListState,
  serializeCurriculumListParams,
  type CurriculumListFilters,
  type CurriculumListLookups,
} from "./curriculum-list-params";

const LOOKUPS: CurriculumListLookups = {
  languages: [{ id: "lang-es" }, { id: "lang-fr" }],
  levels: [{ id: "level-1" }, { id: "level-2" }],
  groups: [{ id: "group-a" }, { id: "group-b" }],
};

const parse = (query: string, lookups = LOOKUPS) =>
  parseCurriculumListParams(new URLSearchParams(query), lookups);

describe("parseCurriculumListParams", () => {
  it("reads every filter, and the cursor", () => {
    expect(
      parse(
        "language=lang-fr&level=level-2&type=grammar&status=draft&group=group-b&search=ser&needs=ipa&cursor=abc",
      ),
    ).toEqual({
      filters: {
        language: "lang-fr",
        level: "level-2",
        type: "grammar",
        status: "draft",
        group: "group-b",
        search: "ser",
        needs: "ipa",
      },
      cursor: "abc",
    });
  });

  it("falls back to the first language when none, or an unknown one, is given", () => {
    expect(parse("").filters.language).toBe("lang-es");
    expect(parse("language=nope").filters.language).toBe("lang-es");
  });

  it("drops enum values outside their whitelist instead of forwarding them", () => {
    const { filters } = parse("type=sentence&status=deleted&needs=validation");
    expect(filters.type).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.needs).toBeUndefined();
  });

  // The "Has Validation Warning" and "Recently Imported" filters have no backing data (spec 25).
  it("does not accept the two spec 25 filters that have no data behind them", () => {
    expect(parse("needs=validation_warning").filters.needs).toBeUndefined();
    expect(parse("needs=recently_imported").filters.needs).toBeUndefined();
  });

  it("drops a level or group that is not in the selected language's lookups", () => {
    const { filters } = parse(
      "level=level-of-another-language&group=elsewhere",
    );
    expect(filters.level).toBeUndefined();
    expect(filters.group).toBeUndefined();
  });

  it("preserves accents and case in search, and trims it", () => {
    expect(parse("search=%20Gáto%20").filters.search).toBe("Gáto");
    expect(parse("search=%20%20").filters.search).toBeUndefined();
  });

  it("treats an empty cursor as no cursor", () => {
    expect(parse("cursor=").cursor).toBeUndefined();
  });

  it("copes with no languages at all", () => {
    expect(
      parse("", { languages: [], levels: [], groups: [] }).filters.language,
    ).toBe("");
  });
});

describe("serializeCurriculumListParams", () => {
  const filters: CurriculumListFilters = {
    language: "lang-es",
    level: "level-1",
    type: "vocabulary",
    status: "pending",
    group: "group-a",
    search: "gato",
    needs: "definition",
  };

  it("uses the pre-migration parameter order, cursor last", () => {
    expect(serializeCurriculumListParams(filters, "tok").toString()).toBe(
      "language=lang-es&level=level-1&type=vocabulary&status=pending&group=group-a&search=gato&needs=definition&cursor=tok",
    );
  });

  it("omits empty values", () => {
    expect(
      serializeCurriculumListParams({ language: "lang-es" }).toString(),
    ).toBe("language=lang-es");
  });

  it("round-trips through parse for any state", () => {
    const state = { filters, cursor: "tok" };
    expect(
      parse(
        serializeCurriculumListParams(state.filters, state.cursor).toString(),
      ),
    ).toEqual(state);
  });

  it("round-trips an accented search", () => {
    const withAccent = { language: "lang-es", search: "sí" };
    expect(
      parse(serializeCurriculumListParams(withAccent).toString()).filters
        .search,
    ).toBe("sí");
  });
});

describe("applyCurriculumFilterChange", () => {
  const previous: CurriculumListFilters = {
    language: "lang-es",
    level: "level-1",
    group: "group-a",
    type: "vocabulary",
  };

  it("keeps unrelated filters when one changes", () => {
    expect(
      applyCurriculumFilterChange(previous, { ...previous, status: "draft" }),
    ).toEqual({ ...previous, status: "draft" });
  });

  it("clears level and group when the language changes", () => {
    const next = applyCurriculumFilterChange(previous, {
      ...previous,
      language: "lang-fr",
    });
    expect(next.language).toBe("lang-fr");
    expect(next.level).toBeUndefined();
    expect(next.group).toBeUndefined();
    expect(next.type).toBe("vocabulary");
  });

  it("clears the group when the level changes", () => {
    const next = applyCurriculumFilterChange(previous, {
      ...previous,
      level: "level-2",
    });
    expect(next.level).toBe("level-2");
    expect(next.group).toBeUndefined();
  });

  it("clears the group when the level is cleared", () => {
    const next = applyCurriculumFilterChange(previous, {
      ...previous,
      level: "",
    });
    expect(next.level).toBeUndefined();
    expect(next.group).toBeUndefined();
  });

  it("treats an empty string as 'no filter'", () => {
    const next = applyCurriculumFilterChange(previous, {
      ...previous,
      type: "",
      search: "",
    });
    expect(next.type).toBeUndefined();
    expect(next.search).toBeUndefined();
  });

  it("never lets the mandatory language be emptied", () => {
    expect(
      applyCurriculumFilterChange(previous, { ...previous, language: "" })
        .language,
    ).toBe("lang-es");
  });

  it("ignores values outside the whitelists and keys it does not know", () => {
    const next = applyCurriculumFilterChange(previous, {
      ...previous,
      status: "deleted",
      sort: "term",
      cursor: "stale",
    });
    expect(next.status).toBeUndefined();
    expect(next).not.toHaveProperty("sort");
    expect(next).not.toHaveProperty("cursor");
  });
});

describe("hasActiveFilters", () => {
  it("is false with only the language", () => {
    expect(hasActiveFilters({ language: "lang-es" })).toBe(false);
  });

  it.each([
    { level: "level-1" },
    { type: "grammar" as const },
    { status: "draft" as const },
    { group: "group-a" },
    { search: "x" },
    { needs: "ipa" as const },
  ])("is true for %o", (extra) => {
    expect(hasActiveFilters({ language: "lang-es", ...extra })).toBe(true);
  });
});

describe("sameListState", () => {
  it("is true for the same filters and cursor", () => {
    const filters = { language: "lang-es", search: "a" };
    expect(
      sameListState({ filters, cursor: "c" }, { filters, cursor: "c" }),
    ).toBe(true);
  });

  it("is false when only the cursor differs", () => {
    const filters = { language: "lang-es" };
    expect(
      sameListState({ filters, cursor: "a" }, { filters, cursor: undefined }),
    ).toBe(false);
  });
});
