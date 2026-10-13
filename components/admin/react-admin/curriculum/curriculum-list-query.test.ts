import { describe, expect, it } from "vitest";

import { CURRICULUM_LIST_SORT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { buildCurriculumListQuery } from "./curriculum-list-query";

const SORT = { ...CURRICULUM_LIST_SORT };
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

describe("buildCurriculumListQuery", () => {
  it("builds the endpoint's query from the supported filters and the page size", () => {
    expect(
      buildCurriculumListQuery({
        filter: {
          language: "lang-es",
          level: "level-1",
          type: "vocabulary",
          status: "draft",
          group: "group-a",
          search: "gáto",
          needs: "ipa",
          cursor: "tok",
        },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe(
      "language=lang-es&level=level-1&type=vocabulary&status=draft&group=group-a&search=g%C3%A1to&needs=ipa&cursor=tok&limit=20",
    );
  });

  it("drops empty and non-string filter values", () => {
    expect(
      buildCurriculumListQuery({
        filter: { language: "lang-es", level: "", type: undefined, group: 3 },
        sort: SORT,
        pagination: PAGE,
      }),
    ).toBe("language=lang-es&limit=20");
  });

  it("works with no filter object at all", () => {
    expect(buildCurriculumListQuery({ pagination: PAGE })).toBe("limit=20");
  });

  describe("refuses what the server cannot do correctly", () => {
    it.each([
      ["a different sort field", { field: "term", order: "ASC" }],
      ["a descending order", { field: SORT.field, order: "DESC" }],
      ["React Admin's default id sort", { field: "id", order: "ASC" }],
    ])("refuses %s", (_name, sort) => {
      const error = refusal(() =>
        buildCurriculumListQuery({
          filter: { language: "lang-es" },
          sort,
          pagination: PAGE,
        }),
      );
      expect(error.kind).toBe("unsupported");
      expect(error.status).toBe(405);
    });

    it.each([2, 3, 0])("refuses a jump to page %i", (page) => {
      const error = refusal(() =>
        buildCurriculumListQuery({
          filter: { language: "lang-es" },
          sort: SORT,
          pagination: { page, perPage: 20 },
        }),
      );
      expect(error.detail).toContain(`page ${page}`);
    });

    it("refuses a filter the endpoint does not implement, rather than ignoring it", () => {
      const error = refusal(() =>
        buildCurriculumListQuery({
          filter: { language: "lang-es", published_after: "2026-01-01" },
          sort: SORT,
          pagination: PAGE,
        }),
      );
      expect(error.detail).toBe("filter by published_after");
    });
  });
});
