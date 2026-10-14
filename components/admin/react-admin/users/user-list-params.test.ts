import { describe, expect, it } from "vitest";

import {
  applyUserFilterChange,
  parseUserListParams,
  serializeUserListParams,
} from "./user-list-params";

const parse = (query: string) =>
  parseUserListParams(new URLSearchParams(query));

describe("parseUserListParams", () => {
  it("reads the search and the cursor", () => {
    expect(parse("search=ana&cursor=abc")).toEqual({
      filters: { search: "ana" },
      cursor: "abc",
    });
  });

  it("is an unfiltered first page for a bare address", () => {
    expect(parse("")).toEqual({
      filters: { search: undefined },
      cursor: undefined,
    });
  });

  it("trims the search, and reads a blank one as none", () => {
    expect(parse("search=%20%20ana%20").filters.search).toBe("ana");
    expect(parse("search=%20%20").filters.search).toBeUndefined();
    expect(parse("search=").filters.search).toBeUndefined();
  });

  it("caps an over-long search, so a hand-edited address cannot become a 422", () => {
    // 100 is what the server accepts: written here as a number, not read from
    // the constant the code under test uses.
    const long = "x".repeat(150);
    expect(parse(`search=${long}`).filters.search).toHaveLength(100);
    expect(parse(`search=${"x".repeat(100)}`).filters.search).toHaveLength(100);
  });

  it("reads an empty cursor as none", () => {
    expect(parse("cursor=").cursor).toBeUndefined();
  });

  it("ignores everything it does not know — there is no role filter and no sandbox switch", () => {
    expect(parse("role=admin&includeSandbox=true&sort=name&page=2")).toEqual({
      filters: { search: undefined },
      cursor: undefined,
    });
  });
});

describe("serializeUserListParams", () => {
  it("writes the search, then the cursor", () => {
    expect(serializeUserListParams({ search: "ana" }, "abc").toString()).toBe(
      "search=ana&cursor=abc",
    );
  });

  it("omits what is empty, so equal states are equal strings", () => {
    expect(serializeUserListParams({}).toString()).toBe("");
    expect(serializeUserListParams({ search: undefined }).toString()).toBe("");
    expect(serializeUserListParams({ search: "ana" }).toString()).toBe(
      "search=ana",
    );
  });

  it("encodes what needs it, and round-trips", () => {
    const filters = { search: "a b&c=d" };
    const query = serializeUserListParams(filters, "x/y").toString();
    expect(parse(query)).toEqual({ filters, cursor: "x/y" });
  });
});

describe("applyUserFilterChange", () => {
  it("takes the search the box now holds", () => {
    expect(applyUserFilterChange({}, { search: "  ana " })).toEqual({
      search: "ana",
    });
  });

  it("clears the search when the box is emptied", () => {
    expect(applyUserFilterChange({ search: "ana" }, { search: "" })).toEqual({
      search: undefined,
    });
    expect(applyUserFilterChange({ search: "ana" }, {})).toEqual({
      search: undefined,
    });
    expect(applyUserFilterChange({ search: "ana" }, { search: null })).toEqual({
      search: undefined,
    });
  });

  it("ignores keys it does not know, rather than forwarding them", () => {
    expect(
      applyUserFilterChange(
        {},
        { search: "ana", role: "admin", includeSandbox: true },
      ),
    ).toEqual({ search: "ana" });
  });

  it("ignores a search that is not text", () => {
    expect(applyUserFilterChange({}, { search: 42 })).toEqual({
      search: undefined,
    });
  });
});
