import { describe, expect, it } from "vitest";

import { CURRICULUM_STATUSES } from "@/domains/admin";

import {
  CEFR_CHOICES,
  CEFR_NONE,
  CEFR_NONE_TEXT,
  STATUS_CHOICES,
  changedFields,
  describeLevelContents,
  readLevelFields,
  statusImpact,
  type LevelFields,
} from "./level-edit-model";

const LEVEL: LevelFields = {
  name: "Basics",
  cefrLevel: "A1",
  status: "draft",
};

describe("readLevelFields", () => {
  it("reads what the form holds", () => {
    expect(
      readLevelFields(
        { name: "Colors", cefrLevel: "B2", status: "published" },
        LEVEL,
      ),
    ).toEqual({ name: "Colors", cefrLevel: "B2", status: "published" });
  });

  it("trims a name, and reads a blank or all-space one as no name", () => {
    expect(readLevelFields({ ...LEVEL, name: "  Colors " }, LEVEL).name).toBe(
      "Colors",
    );
    for (const blank of ["", "   ", null, undefined]) {
      expect(readLevelFields({ ...LEVEL, name: blank }, LEVEL).name).toBeNull();
    }
  });

  it("reads 'Not set' (the select's empty option) as no band", () => {
    for (const none of [CEFR_NONE, "", null, undefined]) {
      expect(
        readLevelFields({ ...LEVEL, cefrLevel: none }, LEVEL).cefrLevel,
      ).toBeNull();
    }
  });

  it("keeps what the level had for a band or status it does not recognise, rather than guessing", () => {
    const read = readLevelFields(
      { name: "x", cefrLevel: "Z9", status: "live" },
      LEVEL,
    );
    expect(read.cefrLevel).toBe("A1");
    expect(read.status).toBe("draft");
  });
});

describe("changedFields", () => {
  it("is empty when nothing changed", () => {
    expect(changedFields(LEVEL, { ...LEVEL })).toEqual({});
  });

  it("names only what differs", () => {
    expect(changedFields(LEVEL, { ...LEVEL, name: "Colors" })).toEqual({
      name: "Colors",
    });
    expect(changedFields(LEVEL, { ...LEVEL, status: "pending" })).toEqual({
      status: "pending",
    });
  });

  it("says null for a field that was cleared — an instruction to clear it, not 'unchanged'", () => {
    expect(
      changedFields(LEVEL, { ...LEVEL, name: null, cefrLevel: null }),
    ).toEqual({ name: null, cefrLevel: null });
  });

  it("reports a field that was set where there was none", () => {
    expect(
      changedFields(
        { name: null, cefrLevel: null, status: "draft" },
        { name: "New", cefrLevel: "C1", status: "draft" },
      ),
    ).toEqual({ name: "New", cefrLevel: "C1" });
  });

  it("builds equal changes in the same order, so a retry is recognised as one", () => {
    const next: LevelFields = { name: "B", cefrLevel: "B1", status: "pending" };
    expect(JSON.stringify(changedFields(LEVEL, next))).toBe(
      JSON.stringify(changedFields(LEVEL, { ...next })),
    );
    expect(Object.keys(changedFields(LEVEL, next))).toEqual([
      "name",
      "cefrLevel",
      "status",
    ]);
  });
});

describe("statusImpact", () => {
  it("needs no confirmation when the status did not change", () => {
    for (const status of CURRICULUM_STATUSES) {
      expect(statusImpact(1, status, status)).toBeNull();
    }
  });

  it("asks before a level goes live, and says what learners get", () => {
    for (const from of ["draft", "pending", "archived"] as const) {
      const impact = statusImpact(7, from, "published");
      expect(impact?.title).toBe("Publish Level 7?");
      expect(impact?.body).toContain("Learners will be able to use this level");
      expect(impact?.confirmLabel).toBe("Publish level");
    }
  });

  it("asks before a level goes dark, and says nothing is lost", () => {
    for (const to of ["draft", "pending", "archived"] as const) {
      const impact = statusImpact(7, "published", to);
      expect(impact?.title).toBe("Hide Level 7 from learners?");
      expect(impact?.body).toContain("no longer be offered anything");
      expect(impact?.body).toContain("Their progress is kept");
      expect(impact?.confirmLabel).toBe("Hide level");
    }
  });

  it("does not ask about moves learners cannot see", () => {
    const hidden = ["draft", "pending", "archived"] as const;
    for (const from of hidden) {
      for (const to of hidden) {
        expect(statusImpact(1, from, to)).toBeNull();
      }
    }
  });
});

describe("describeLevelContents", () => {
  it("states what the level holds, and that nothing here is a gate", () => {
    expect(
      describeLevelContents({
        vocabularyItems: 45,
        grammarItems: 12,
        vocabularyGroups: 4,
      }),
    ).toBe(
      "Contains 45 vocabulary items across 4 groups, and 12 grammar items. A level can hold any number of either — publishing it is your call.",
    );
  });

  it("uses the singular for one, and handles a level that holds nothing", () => {
    expect(
      describeLevelContents({
        vocabularyItems: 1,
        grammarItems: 1,
        vocabularyGroups: 1,
      }),
    ).toContain("1 vocabulary item across 1 group, and 1 grammar item.");
    expect(
      describeLevelContents({
        vocabularyItems: 0,
        grammarItems: 0,
        vocabularyGroups: 0,
      }),
    ).toContain("0 vocabulary items across 0 groups, and 0 grammar items.");
  });
});

describe("the choices the selects offer", () => {
  it("offers every status, in the contract's order, with readable labels", () => {
    expect(STATUS_CHOICES.map((c) => c.id)).toEqual([...CURRICULUM_STATUSES]);
    expect(STATUS_CHOICES.map((c) => c.name)).toEqual([
      "Draft",
      "Pending",
      "Published",
      "Archived",
    ]);
  });

  it("offers each band — 'Not set' is the select's empty option, not one of them", () => {
    expect(CEFR_CHOICES.map((c) => c.name)).toEqual([
      "A1",
      "A2",
      "B1",
      "B2",
      "C1",
      "C2",
    ]);
    expect(CEFR_NONE_TEXT).toBe("Not set");
  });

  it("gives the empty option a value Material UI will display, which the empty string is not", () => {
    expect(CEFR_NONE).not.toBe("");
    expect(CEFR_CHOICES.some((c) => (c.id as string) === CEFR_NONE)).toBe(
      false,
    );
  });
});
