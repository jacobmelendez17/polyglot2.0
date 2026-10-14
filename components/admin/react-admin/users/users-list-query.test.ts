import { describe, expect, it } from "vitest";

import { USER_LIST_PAGE_SIZE, USER_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { buildUsersListQuery } from "./users-list-query";

const SORT = { ...USER_LIST_SORT };
const PAGE = { page: 1, perPage: USER_LIST_PAGE_SIZE };

function refusal(call: () => unknown): AdminApiError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminApiError);
    return error as AdminApiError;
  }
  throw new Error("expected the call to be refused");
}

describe("buildUsersListQuery", () => {
  it("asks for the first page at the page size, with no filters", () => {
    expect(
      buildUsersListQuery({ filter: {}, sort: SORT, pagination: PAGE }),
    ).toBe(`limit=${USER_LIST_PAGE_SIZE}`);
  });

  it("passes on a search and a cursor, search first", () => {
    expect(
      buildUsersListQuery({
        filter: { cursor: "abc", search: "ana" },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe(`search=ana&cursor=abc&limit=${USER_LIST_PAGE_SIZE}`);
  });

  it("drops an empty filter, as the controller always names the cursor even when it has none", () => {
    expect(
      buildUsersListQuery({
        filter: { search: "", cursor: undefined },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe(`limit=${USER_LIST_PAGE_SIZE}`);
  });

  it("encodes what needs it", () => {
    expect(
      buildUsersListQuery({ filter: { search: "a b&c" }, sort: SORT }),
    ).toBe("search=a+b%26c");
  });

  describe("refuses what the endpoint cannot do", () => {
    it.each([
      ["another sort", { field: "display_name", order: "ASC" }],
      ["the opposite order", { field: SORT.field, order: "ASC" }],
      ["React Admin's default sort", { field: "id", order: "ASC" }],
    ])(
      "refuses %s — a cursor only means something under the order that made it",
      (_name, sort) => {
        expect(
          refusal(() =>
            buildUsersListQuery({ filter: {}, sort, pagination: PAGE }),
          ).kind,
        ).toBe("unsupported");
      },
    );

    it("refuses a page jump", () => {
      expect(
        refusal(() =>
          buildUsersListQuery({
            filter: {},
            sort: SORT,
            pagination: { page: 3, perPage: 20 },
          }),
        ).detail,
      ).toContain("page 3");
    });

    // Not offered by the server, so not offered here — in particular there is
    // no way to ask for sandbox personas.
    it.each([
      "role",
      "includeSandbox",
      "isSandbox",
      "language",
      "status",
      "id",
    ])("refuses a %s filter", (key) => {
      expect(
        refusal(() =>
          buildUsersListQuery({
            filter: { [key]: "x" },
            sort: SORT,
            pagination: PAGE,
          }),
        ).detail,
      ).toBe(`filter by ${key}`);
    });
  });
});
