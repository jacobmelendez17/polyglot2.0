import { describe, expect, it } from "vitest";

import { ADMIN_AUDIT_ACTIONS } from "@/domains/admin";

import {
  applyLogFilterChange,
  hasActiveLogFilters,
  isLogRefinement,
  logListCodec,
  parseLogListParams,
  serializeLogListParams,
} from "./logs-list-params";

const ACTOR = "a0000000-0000-4000-8000-000000000001";
const parse = (query: string) => parseLogListParams(new URLSearchParams(query));

describe("parseLogListParams", () => {
  it("reads an address with nothing in it as the whole log, first page", () => {
    expect(parse("")).toEqual({
      filters: {
        actor: undefined,
        action: undefined,
        resourceType: undefined,
        resourceId: undefined,
        from: undefined,
        to: undefined,
      },
      cursor: undefined,
    });
  });

  it("reads each parameter the Logs page always wrote", () => {
    expect(
      parse(
        `actor=${ACTOR}&action=USER_ROLE_CHANGED&resourceType=user&resourceId=r-1&from=2026-10-01&to=2026-10-14&cursor=here`,
      ),
    ).toEqual({
      filters: {
        actor: ACTOR,
        action: "USER_ROLE_CHANGED",
        resourceType: "user",
        resourceId: "r-1",
        from: "2026-10-01",
        to: "2026-10-14",
      },
      cursor: "here",
    });
  });

  it("ignores the page's own `tab` — it is not the list's, and is never sent to the endpoint", () => {
    expect(parse("tab=audit&action=USER_ROLE_CHANGED")).toEqual(
      parse("action=USER_ROLE_CHANGED"),
    );
  });

  it.each(ADMIN_AUDIT_ACTIONS)("knows the action %s", (action) => {
    expect(parse(`action=${action}`).filters.action).toBe(action);
  });

  it("drops what the endpoint would refuse, rather than sending it to be refused", () => {
    const { filters } = parse(
      `actor=ada&action=SOMETHING_ELSE&from=yesterday&to=2026-02-30&resourceType=${"x".repeat(101)}&resourceId=${"x".repeat(201)}`,
    );
    expect(filters).toEqual({
      actor: undefined,
      action: undefined,
      resourceType: undefined,
      resourceId: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("trims what was typed, and treats spaces as nothing", () => {
    expect(
      parse("resourceType=%20user%20&resourceId=%20%20").filters,
    ).toMatchObject({ resourceType: "user", resourceId: undefined });
  });
});

describe("serializeLogListParams", () => {
  it("writes the filters in a fixed order, the cursor last, and leaves empty ones out", () => {
    expect(
      serializeLogListParams(
        {
          to: "2026-10-14",
          resourceId: "r-1",
          action: "USER_ROLE_CHANGED",
          actor: ACTOR,
          from: "2026-10-01",
          resourceType: "user",
        },
        "here",
      ).toString(),
    ).toBe(
      `actor=${ACTOR}&action=USER_ROLE_CHANGED&resourceType=user&resourceId=r-1&from=2026-10-01&to=2026-10-14&cursor=here`,
    );
    expect(serializeLogListParams({}).toString()).toBe("");
  });

  it("round-trips: what is written reads back the same", () => {
    const state = {
      filters: {
        actor: ACTOR,
        action: "GROUP_CREATED" as const,
        resourceType: "group",
        resourceId: "g-1",
        from: "2026-10-01",
        to: "2026-10-14",
      },
      cursor: "abc",
    };
    expect(
      parse(serializeLogListParams(state.filters, state.cursor).toString()),
    ).toEqual(state);
  });
});

describe("applyLogFilterChange — an edit of the filter form", () => {
  it("takes the form's whole set of values and cleans each, like a value from the address", () => {
    expect(
      applyLogFilterChange(
        {},
        {
          actor: ACTOR,
          action: "USER_ROLE_CHANGED",
          resourceType: " user ",
          resourceId: "",
          from: "2026-10-01",
          to: null,
        },
      ),
    ).toEqual({
      actor: ACTOR,
      action: "USER_ROLE_CHANGED",
      resourceType: "user",
      resourceId: undefined,
      from: "2026-10-01",
      to: undefined,
    });
  });

  it("does not treat a half-typed actor id as a filter yet", () => {
    expect(applyLogFilterChange({}, { actor: "a0000000-0000" }).actor).toBe(
      undefined,
    );
  });

  it("clears a filter the form has emptied — it keeps nothing of the previous state", () => {
    expect(
      applyLogFilterChange(
        { action: "USER_ROLE_CHANGED", from: "2026-10-01" },
        { action: "", from: "" },
      ),
    ).toEqual({
      actor: undefined,
      action: undefined,
      resourceType: undefined,
      resourceId: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("is what the list codec applies", () => {
    expect(logListCodec.applyChange({}, { action: "GROUP_CREATED" })).toEqual(
      applyLogFilterChange({}, { action: "GROUP_CREATED" }),
    );
  });
});

describe("isLogRefinement — typing replaces the history entry, choosing opens a new view", () => {
  it("is true when only the typed boxes changed", () => {
    expect(
      isLogRefinement({ resourceType: "us" }, { resourceType: "user" }),
    ).toBe(true);
    expect(isLogRefinement({}, { actor: ACTOR })).toBe(true);
    expect(
      isLogRefinement({ resourceId: "a" }, { resourceId: undefined }),
    ).toBe(true);
  });

  it("is false for a chosen action or date, and for nothing changing at all", () => {
    expect(isLogRefinement({}, { action: "GROUP_CREATED" })).toBe(false);
    expect(isLogRefinement({}, { from: "2026-10-01" })).toBe(false);
    expect(isLogRefinement({}, { to: "2026-10-01" })).toBe(false);
    expect(isLogRefinement({}, {})).toBe(false);
    // Typing *and* choosing at once is a new view.
    expect(
      isLogRefinement({}, { resourceType: "user", action: "GROUP_CREATED" }),
    ).toBe(false);
  });
});

describe("hasActiveLogFilters", () => {
  it("tells 'nothing yet' from 'nothing matches'", () => {
    expect(hasActiveLogFilters({})).toBe(false);
    expect(hasActiveLogFilters({ action: undefined })).toBe(false);
    expect(hasActiveLogFilters({ resourceType: "user" })).toBe(true);
    expect(hasActiveLogFilters({ from: "2026-10-01" })).toBe(true);
  });
});
