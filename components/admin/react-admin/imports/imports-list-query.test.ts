import { describe, expect, it } from "vitest";

import { IMPORT_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { buildImportsListQuery } from "./imports-list-query";

const SORT = { ...IMPORT_LIST_SORT };
const PAGE = { page: 1, perPage: 20 };

function refusal(call: () => unknown): AdminApiError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminApiError);
    return error as AdminApiError;
  }
  throw new Error("expected the call to be refused");
}

describe("buildImportsListQuery", () => {
  it("builds the endpoint's query from the language, the cursor and the page size", () => {
    expect(
      buildImportsListQuery({
        filter: { language: "lang-es", cursor: "tok" },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&cursor=tok&limit=20");
  });

  it("asks for the archived history only when the filter says so", () => {
    expect(
      buildImportsListQuery({
        filter: { language: "lang-es", archived: "true" },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&archived=true&limit=20");
    // An absent flag is the normal history: nothing is sent.
    expect(
      buildImportsListQuery({
        filter: { language: "lang-es", archived: undefined },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&limit=20");
  });

  it("drops an absent cursor", () => {
    expect(
      buildImportsListQuery({
        filter: { language: "lang-es", cursor: undefined },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&limit=20");
  });

  describe("refuses what the endpoint cannot do", () => {
    it.each([
      ["another sort", { field: "status", order: "ASC" }],
      ["the opposite order", { field: SORT.field, order: "ASC" }],
      // The review queue's ordering is not the history's.
      ["the review ordering", { field: "review_order", order: "ASC" }],
    ])("refuses %s", (_name, sort) => {
      expect(
        refusal(() =>
          buildImportsListQuery({
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
          buildImportsListQuery({
            filter: { language: "lang-es" },
            sort: SORT,
            pagination: { page: 2, perPage: 20 },
          }),
        ).detail,
      ).toContain("page 2");
    });

    // Nothing in the service honours a status filter or a search.
    it.each(["status", "search", "uploadedBy", "level", "type", "needs"])(
      "refuses a %s filter",
      (key) => {
        expect(
          refusal(() =>
            buildImportsListQuery({
              filter: { language: "lang-es", [key]: "x" },
              sort: SORT,
              pagination: PAGE,
            }),
          ).detail,
        ).toBe(`filter by ${key}`);
      },
    );
  });
});
