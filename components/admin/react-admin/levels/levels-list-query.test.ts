import { describe, expect, it } from "vitest";

import { LEVEL_LIST_MAX, LEVEL_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { buildLevelsListQuery } from "./levels-list-query";

const SORT = { ...LEVEL_LIST_SORT };
const PAGE = { page: 1, perPage: LEVEL_LIST_MAX };

function refusal(call: () => unknown): AdminApiError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminApiError);
    return error as AdminApiError;
  }
  throw new Error("expected the call to be refused");
}

describe("buildLevelsListQuery", () => {
  it("builds the endpoint's query from the language alone", () => {
    expect(
      buildLevelsListQuery({
        filter: { language: "lang-es" },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es");
  });

  it("never sends a page size — the endpoint rejects a limit it does not implement", () => {
    expect(
      buildLevelsListQuery({
        filter: { language: "lang-es" },
        sort: SORT,
        pagination: { page: 1, perPage: 7 },
      }),
    ).not.toContain("limit");
  });

  it("ignores the cursor key the shared list controller always names, while it is empty", () => {
    expect(
      buildLevelsListQuery({
        filter: { language: "lang-es", cursor: undefined },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es");
  });

  it("encodes the language", () => {
    expect(
      buildLevelsListQuery({ filter: { language: "a b&c" }, sort: SORT }),
    ).toBe("language=a+b%26c");
  });

  describe("refuses what the endpoint cannot do", () => {
    it.each([
      ["another sort", { field: "name", order: "ASC" }],
      ["a descending order", { field: SORT.field, order: "DESC" }],
      ["the review ordering", { field: "review_order", order: "ASC" }],
    ])("refuses %s", (_name, sort) => {
      expect(
        refusal(() =>
          buildLevelsListQuery({
            filter: { language: "lang-es" },
            sort,
            pagination: PAGE,
          }),
        ).kind,
      ).toBe("unsupported");
    });

    it("refuses a page jump", () => {
      expect(
        refusal(() =>
          buildLevelsListQuery({
            filter: { language: "lang-es" },
            sort: SORT,
            pagination: { page: 2, perPage: 20 },
          }),
        ).detail,
      ).toContain("page 2");
    });

    it("refuses a real cursor — there are no pages to move between", () => {
      expect(
        refusal(() =>
          buildLevelsListQuery({
            filter: { language: "lang-es", cursor: "tok" },
            sort: SORT,
            pagination: PAGE,
          }),
        ).detail,
      ).toBe("a cursor");
    });

    it.each(["level", "type", "status", "group", "search", "needs", "kind"])(
      "refuses a %s filter",
      (key) => {
        expect(
          refusal(() =>
            buildLevelsListQuery({
              filter: { language: "lang-es", [key]: "x" },
              sort: SORT,
              pagination: PAGE,
            }),
          ).detail,
        ).toBe(`filter by ${key}`);
      },
    );

    it.each([[{}], [{ language: "" }], [{ language: undefined }]])(
      "refuses a list with no language (%j)",
      (filter) => {
        expect(
          refusal(() => buildLevelsListQuery({ filter, sort: SORT })).kind,
        ).toBe("unsupported");
      },
    );
  });
});
