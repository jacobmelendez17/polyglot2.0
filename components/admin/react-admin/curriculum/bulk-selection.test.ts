import { describe, expect, it } from "vitest";

import {
  archivePlan,
  itemCount,
  moveToGroupPlan,
  moveToLevelPlan,
  publishPlan,
  type BulkRow,
} from "./bulk-selection";

let counter = 0;
function row(overrides: Partial<BulkRow> = {}): BulkRow {
  counter += 1;
  return {
    id: `item-${counter}`,
    type: "vocabulary",
    status: "published",
    levelId: "level-1",
    levelNumber: 1,
    groupId: null,
    itemLabel: `palabra ${counter}`,
    ...overrides,
  };
}

describe("itemCount", () => {
  it("says item for one and items otherwise", () => {
    expect(itemCount(0)).toBe("0 items");
    expect(itemCount(1)).toBe("1 item");
    expect(itemCount(2)).toBe("2 items");
  });
});

describe("publishPlan", () => {
  it("can publish a selection that is entirely Pending", () => {
    const rows = [
      row({ status: "pending" }),
      row({ status: "pending", type: "grammar" }),
    ];
    const plan = publishPlan(rows);
    expect(plan.canPublish).toBe(true);
    expect(plan.pending).toEqual(rows);
    expect(plan.notPending).toBe(0);
  });

  it("cannot publish when any selected item is not Pending", () => {
    for (const status of ["published", "draft", "archived"] as const) {
      const pending = row({ status: "pending" });
      const other = row({ status });
      const plan = publishPlan([pending, other]);
      expect(plan.canPublish, status).toBe(false);
      expect(plan.pending, status).toEqual([pending]);
      expect(plan.notPending, status).toBe(1);
    }
  });

  it("counts every item that is not Pending, and keeps the Pending ones in order", () => {
    const a = row({ status: "pending" });
    const b = row({ status: "published" });
    const c = row({ status: "pending" });
    const d = row({ status: "archived" });
    const e = row({ status: "draft" });
    const plan = publishPlan([a, b, c, d, e]);
    expect(plan.canPublish).toBe(false);
    expect(plan.pending).toEqual([a, c]);
    expect(plan.notPending).toBe(3);
  });

  it("cannot publish an empty selection", () => {
    const plan = publishPlan([]);
    expect(plan.canPublish).toBe(false);
    expect(plan.pending).toEqual([]);
    expect(plan.notPending).toBe(0);
  });
});

describe("archivePlan", () => {
  it("archives everything that is not already archived", () => {
    const plan = archivePlan([
      row({ status: "pending" }),
      row({ status: "published" }),
      row({ status: "draft" }),
    ]);
    expect(plan.archiving).toBe(3);
    expect(plan.alreadyArchived).toBe(0);
  });

  it("leaves what is already archived alone, and says how many", () => {
    const plan = archivePlan([
      row({ status: "archived" }),
      row({ status: "archived" }),
      row({ status: "published" }),
    ]);
    expect(plan.archiving).toBe(1);
    expect(plan.alreadyArchived).toBe(2);
  });

  it("counts what is live to learners — published, and published with changes — but not Pending", () => {
    const plan = archivePlan([
      row({ status: "published" }),
      row({ status: "draft" }),
      row({ status: "pending" }),
      row({ status: "archived" }),
    ]);
    expect(plan.live).toBe(2);
  });

  it("counts the unpublished changes archiving discards, only on rows that will be archived", () => {
    const plan = archivePlan([
      row({ status: "draft" }),
      row({ status: "draft" }),
      row({ status: "published" }),
    ]);
    expect(plan.withUnpublishedChanges).toBe(2);
  });

  it("describes an empty selection as nothing to do", () => {
    expect(archivePlan([])).toEqual({
      archiving: 0,
      alreadyArchived: 0,
      live: 0,
      withUnpublishedChanges: 0,
    });
  });
});

describe("moveToLevelPlan", () => {
  it("moves what is not in the level, and leaves what is", () => {
    const plan = moveToLevelPlan(
      [
        row({ levelId: "level-1" }),
        row({ levelId: "level-2" }),
        row({ levelId: "level-2" }),
      ],
      "level-2",
    );
    expect(plan.moving).toBe(1);
    expect(plan.alreadyThere).toBe(2);
  });

  it("moves everything when none is there yet", () => {
    const plan = moveToLevelPlan([row(), row()], "level-3");
    expect(plan.moving).toBe(2);
    expect(plan.alreadyThere).toBe(0);
  });

  it("counts the moving items that are live to learners, not the ones already there", () => {
    const plan = moveToLevelPlan(
      [
        row({ status: "published", levelId: "level-1" }),
        row({ status: "draft", levelId: "level-1" }),
        row({ status: "pending", levelId: "level-1" }),
        row({ status: "published", levelId: "level-2" }),
      ],
      "level-2",
    );
    expect(plan.moving).toBe(3);
    expect(plan.live).toBe(2);
  });

  it("says which moving grammar items lose their group, and which vocabulary keeps its own", () => {
    const plan = moveToLevelPlan(
      [
        row({ type: "grammar", groupId: "group-a" }),
        row({ type: "grammar", groupId: null }),
        row({ type: "vocabulary", groupId: "group-a" }),
        row({ type: "vocabulary", groupId: "group-b" }),
        // Already there: neither loses nor keeps anything.
        row({ type: "grammar", groupId: "group-a", levelId: "level-2" }),
      ],
      "level-2",
    );
    expect(plan.moving).toBe(4);
    expect(plan.losingTheirGroup).toBe(1);
    expect(plan.keepingTheirGroup).toBe(2);
  });
});

describe("moveToGroupPlan", () => {
  const group = { id: "group-a", levelNumber: 1 };

  it("files what is not in the group, and leaves what is", () => {
    const plan = moveToGroupPlan(
      [
        row({ groupId: null }),
        row({ groupId: "group-b" }),
        row({ groupId: "group-a" }),
      ],
      group,
    );
    expect(plan.moving).toBe(2);
    expect(plan.alreadyThere).toBe(1);
  });

  it("counts the moving items whose level is not the group's", () => {
    const plan = moveToGroupPlan(
      [
        row({ levelNumber: 1 }),
        row({ levelNumber: 2 }),
        row({ levelNumber: 3 }),
        // Already in the group: not moving, so not counted.
        row({ levelNumber: 3, groupId: "group-a" }),
      ],
      group,
    );
    expect(plan.moving).toBe(3);
    expect(plan.inAnotherLevel).toBe(2);
  });

  it("treats a grammar item as movable into a group like any other", () => {
    const plan = moveToGroupPlan(
      [row({ type: "grammar", groupId: null })],
      group,
    );
    expect(plan.moving).toBe(1);
  });
});
