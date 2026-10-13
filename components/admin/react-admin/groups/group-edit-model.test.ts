import { describe, expect, it } from "vitest";

import { CURRICULUM_STATUSES, GROUP_NAME_MAX } from "@/domains/admin";

import {
  changedFields,
  checkGroupName,
  readGroupFields,
  statusImpact,
  type GroupFields,
} from "./group-edit-model";

const GROUP: GroupFields = { name: "Colors", status: "draft" };

describe("checkGroupName", () => {
  it("accepts a name", () => {
    expect(checkGroupName("Colors")).toBeUndefined();
    expect(checkGroupName("  Colors  ")).toBeUndefined();
  });

  it.each([[""], ["   "], [null], [undefined], [42]])(
    "refuses %j as no name, in the form's own words",
    (value) => {
      expect(checkGroupName(value)).toBe("Enter a name for this group.");
    },
  );

  it("accepts a name of exactly the longest length — measured after trimming, as the server does", () => {
    expect(checkGroupName("x".repeat(GROUP_NAME_MAX))).toBeUndefined();
    expect(checkGroupName(`  ${"x".repeat(GROUP_NAME_MAX)}  `)).toBeUndefined();
  });

  it("refuses a name one character too long, and says the limit", () => {
    expect(checkGroupName("x".repeat(GROUP_NAME_MAX + 1))).toBe(
      `Keep the name to ${GROUP_NAME_MAX} characters or fewer.`,
    );
  });
});

describe("readGroupFields", () => {
  it("reads what the form holds", () => {
    expect(
      readGroupFields({ name: "Animals", status: "published" }, GROUP),
    ).toEqual({ name: "Animals", status: "published" });
  });

  it("trims the name", () => {
    expect(readGroupFields({ ...GROUP, name: "  Animals " }, GROUP).name).toBe(
      "Animals",
    );
  });

  it("keeps the group's name for a blank one rather than send an empty name — a group always has one", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(readGroupFields({ ...GROUP, name: blank }, GROUP).name).toBe(
        "Colors",
      );
    }
  });

  it("keeps the group's status for one it does not recognise, rather than guessing", () => {
    expect(readGroupFields({ name: "x", status: "live" }, GROUP).status).toBe(
      "draft",
    );
    expect(readGroupFields({ name: "x", status: null }, GROUP).status).toBe(
      "draft",
    );
  });
});

describe("changedFields", () => {
  it("is empty when nothing changed", () => {
    expect(changedFields(GROUP, { ...GROUP })).toEqual({});
  });

  it("names only what differs", () => {
    expect(changedFields(GROUP, { ...GROUP, name: "Animals" })).toEqual({
      name: "Animals",
    });
    expect(changedFields(GROUP, { ...GROUP, status: "pending" })).toEqual({
      status: "pending",
    });
  });

  it("builds equal changes in the same order, so a retry is recognised as one", () => {
    const next: GroupFields = { name: "B", status: "pending" };
    expect(Object.keys(changedFields(GROUP, next))).toEqual(["name", "status"]);
    expect(JSON.stringify(changedFields(GROUP, next))).toBe(
      JSON.stringify(changedFields(GROUP, { ...next })),
    );
  });

  it("can never say 'position' or 'level' — moving and ordering are not this form's", () => {
    const changes = changedFields(GROUP, { name: "Z", status: "archived" });
    expect(Object.keys(changes).sort()).toEqual(["name", "status"]);
  });
});

describe("statusImpact", () => {
  it("asks before archiving, naming the group and what archiving means", () => {
    for (const from of ["draft", "pending", "published"] as const) {
      const impact = statusImpact("Colors", from, "archived");
      expect(impact?.title).toBe("Archive “Colors”?");
      expect(impact?.body).toContain("stay on record");
      expect(impact?.body).toContain("keep their group assignment");
      expect(impact?.confirmLabel).toBe("Archive");
      expect(impact?.destructive).toBe(true);
    }
  });

  it("needs no confirmation when the status did not change — including a group that is already archived", () => {
    for (const status of CURRICULUM_STATUSES) {
      expect(statusImpact("Colors", status, status)).toBeNull();
    }
  });

  it("does not ask about any other move, as the form it replaces did not", () => {
    for (const from of CURRICULUM_STATUSES) {
      for (const to of CURRICULUM_STATUSES) {
        if (to === "archived" || from === to) continue;
        expect(statusImpact("Colors", from, to)).toBeNull();
      }
    }
  });
});
