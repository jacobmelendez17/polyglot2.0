import { describe, expect, it } from "vitest";

import { GROUP_LIST_MAX, GROUP_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { buildGroupsListQuery } from "./groups-list-query";

const SORT = { ...GROUP_LIST_SORT };
const PAGE = { page: 1, perPage: GROUP_LIST_MAX };
const SCOPE = { language: "lang-es", level: "level-1" };

function refusal(call: () => unknown): AdminApiError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminApiError);
    return error as AdminApiError;
  }
  throw new Error("expected the call to be refused");
}

describe("buildGroupsListQuery", () => {
  it("builds the endpoint's query from the language and the level", () => {
    expect(
      buildGroupsListQuery({ filter: SCOPE, sort: SORT, pagination: PAGE }),
    ).toBe("language=lang-es&level=level-1");
  });

  it("never sends a page size — the endpoint rejects a limit it does not implement", () => {
    expect(
      buildGroupsListQuery({
        filter: SCOPE,
        sort: SORT,
        pagination: { page: 1, perPage: 7 },
      }),
    ).not.toContain("limit");
  });

  it("ignores the cursor key the shared list controller always names, while it is empty", () => {
    expect(
      buildGroupsListQuery({
        filter: { ...SCOPE, cursor: undefined },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&level=level-1");
  });

  it("encodes both", () => {
    expect(
      buildGroupsListQuery({
        filter: { language: "a b&c", level: "x/y" },
        sort: SORT,
      }),
    ).toBe("language=a+b%26c&level=x%2Fy");
  });

  describe("refuses what the endpoint cannot do", () => {
    it.each([
      ["another sort", { field: "name", order: "ASC" }],
      ["a descending order", { field: SORT.field, order: "DESC" }],
      ["a sort by status", { field: "status", order: "ASC" }],
    ])(
      "refuses %s — the position is the order, and a list sort must never stand in for it",
      (_name, sort) => {
        expect(
          refusal(() =>
            buildGroupsListQuery({ filter: SCOPE, sort, pagination: PAGE }),
          ).kind,
        ).toBe("unsupported");
      },
    );

    it("refuses a page jump", () => {
      expect(
        refusal(() =>
          buildGroupsListQuery({
            filter: SCOPE,
            sort: SORT,
            pagination: { page: 2, perPage: 20 },
          }),
        ).detail,
      ).toContain("page 2");
    });

    it("refuses a real cursor — there are no pages to move between", () => {
      expect(
        refusal(() =>
          buildGroupsListQuery({
            filter: { ...SCOPE, cursor: "tok" },
            sort: SORT,
            pagination: PAGE,
          }),
        ).detail,
      ).toBe("a cursor");
    });

    it.each(["type", "status", "group", "search", "needs", "kind", "mode"])(
      "refuses a %s filter",
      (key) => {
        expect(
          refusal(() =>
            buildGroupsListQuery({
              filter: { ...SCOPE, [key]: "x" },
              sort: SORT,
              pagination: PAGE,
            }),
          ).detail,
        ).toBe(`filter by ${key}`);
      },
    );

    it.each([
      [{}],
      [{ level: "level-1" }],
      [{ language: "", level: "level-1" }],
      [{ language: undefined, level: "level-1" }],
    ])("refuses a list with no language (%j)", (filter) => {
      expect(
        refusal(() => buildGroupsListQuery({ filter, sort: SORT })).detail,
      ).toBe("listing groups without a language");
    });

    // Groups are never listed across levels: positions are per level.
    it.each([
      [{ language: "lang-es" }],
      [{ language: "lang-es", level: "" }],
      [{ language: "lang-es", level: undefined }],
    ])("refuses a list with no level (%j)", (filter) => {
      expect(
        refusal(() => buildGroupsListQuery({ filter, sort: SORT })).detail,
      ).toBe("listing groups without a level");
    });
  });
});
