import { describe, expect, it } from "vitest";

import { REVIEW_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { buildReviewListQuery } from "./review-list-query";

const SORT = { ...REVIEW_LIST_SORT };
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

describe("buildReviewListQuery", () => {
  it("builds the endpoint's query from the language, cursor, and page size", () => {
    expect(
      buildReviewListQuery({
        filter: { language: "lang-es", cursor: "tok" },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&cursor=tok&limit=20");
  });

  it("drops an absent cursor", () => {
    expect(
      buildReviewListQuery({
        filter: { language: "lang-es", cursor: undefined },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&limit=20");
  });

  describe("refuses what the endpoint cannot do", () => {
    it.each([
      ["another sort", { field: "label", order: "ASC" }],
      ["a descending order", { field: SORT.field, order: "DESC" }],
      // The curriculum list's ordering is not this queue's.
      ["the curriculum ordering", { field: "curriculum_order", order: "ASC" }],
    ])("refuses %s", (_name, sort) => {
      expect(
        refusal(() =>
          buildReviewListQuery({
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
          buildReviewListQuery({
            filter: { language: "lang-es" },
            sort: SORT,
            pagination: { page: 2, perPage: 20 },
          }),
        ).detail,
      ).toContain("page 2");
    });

    // The curriculum list's filters do not exist on the queue.
    it.each(["level", "type", "status", "group", "search", "needs", "kind"])(
      "refuses a %s filter",
      (key) => {
        expect(
          refusal(() =>
            buildReviewListQuery({
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
