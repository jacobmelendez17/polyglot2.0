import { describe, expect, it } from "vitest";

import {
  archiveNotes,
  archivedMessage,
  moveToGroupImpact,
  moveToLevelImpact,
  movedMessage,
  publishBlockedNote,
  publishedMessage,
} from "./bulk-impact";

describe("publish wording", () => {
  it("explains why Publish is unavailable, in the singular and the plural", () => {
    expect(
      publishBlockedNote({ canPublish: false, pending: [], notPending: 1 }),
    ).toBe("Publish needs every selected item to be Pending — 1 isn't.");
    expect(
      publishBlockedNote({ canPublish: false, pending: [], notPending: 3 }),
    ).toBe("Publish needs every selected item to be Pending — 3 aren't.");
  });

  it("reports what was published", () => {
    expect(publishedMessage(1)).toBe("Published 1 item.");
    expect(publishedMessage(4)).toBe("Published 4 items.");
  });
});

describe("archive wording", () => {
  it("says nothing when nothing needs saying", () => {
    expect(
      archiveNotes({
        archiving: 2,
        alreadyArchived: 0,
        live: 0,
        withUnpublishedChanges: 0,
      }),
    ).toEqual([]);
  });

  it("says what is live, what is discarded, and what is left alone", () => {
    expect(
      archiveNotes({
        archiving: 3,
        alreadyArchived: 2,
        live: 3,
        withUnpublishedChanges: 1,
      }),
    ).toEqual([
      "3 items are live to learners and will be withdrawn from them.",
      "1 item has unpublished changes, which archiving discards.",
      "2 items are already archived and will be left as they are.",
    ]);
  });

  it("agrees with a single item", () => {
    expect(
      archiveNotes({
        archiving: 1,
        alreadyArchived: 1,
        live: 1,
        withUnpublishedChanges: 0,
      }),
    ).toEqual([
      "1 item is live to learners and will be withdrawn from them.",
      "1 item is already archived and will be left as it is.",
    ]);
  });

  it("reports what was archived, and what was already", () => {
    expect(archivedMessage(2, 0)).toBe("Archived 2 items.");
    expect(archivedMessage(1, 0)).toBe("Archived 1 item.");
    expect(archivedMessage(2, 1)).toBe(
      "Archived 2 items (1 already archived).",
    );
  });

  it("says plainly when there was nothing left to archive", () => {
    expect(archivedMessage(0, 3)).toBe(
      "Nothing to archive — 3 items already archived.",
    );
  });
});

describe("move to a level", () => {
  const plan = {
    moving: 2,
    alreadyThere: 0,
    live: 0,
    losingTheirGroup: 0,
    keepingTheirGroup: 0,
  };

  it("says where the items go and that they join the end of its order", () => {
    expect(moveToLevelImpact(plan, 2, 3)).toEqual({
      headline: "2 items will move to Level 3, to the end of its order.",
      notes: [],
      nothingToDo: false,
    });
  });

  it("says what else happens, one sentence each", () => {
    const impact = moveToLevelImpact(
      {
        moving: 4,
        alreadyThere: 1,
        live: 2,
        losingTheirGroup: 1,
        keepingTheirGroup: 2,
      },
      5,
      3,
    );
    expect(impact.nothingToDo).toBe(false);
    expect(impact.notes).toEqual([
      "1 item already in Level 3 is left where it is.",
      "2 items are live to learners and will change level for them straight away.",
      "1 grammar item filed under a group will lose it — a group belongs to one level.",
      "Vocabulary keeps its group; use Move to group to change that.",
    ]);
  });

  it("pluralises the grammar items that lose a group", () => {
    const impact = moveToLevelImpact({ ...plan, losingTheirGroup: 2 }, 2, 3);
    expect(impact.notes).toEqual([
      "2 grammar items filed under a group will lose it — a group belongs to one level.",
    ]);
  });

  it("has nothing to confirm when everything is already there", () => {
    expect(
      moveToLevelImpact({ ...plan, moving: 0, alreadyThere: 3 }, 3, 2),
    ).toEqual({
      headline:
        "All 3 selected items are already in Level 2. Nothing will change.",
      notes: [],
      nothingToDo: true,
    });
    expect(
      moveToLevelImpact({ ...plan, moving: 0, alreadyThere: 1 }, 1, 2).headline,
    ).toBe("The selected item is already in Level 2. Nothing will change.");
  });
});

describe("move to a group", () => {
  const group = { name: "Animals", levelNumber: 2 };
  const plan = { moving: 2, alreadyThere: 0, inAnotherLevel: 0 };

  it("says which group the items are filed under", () => {
    expect(moveToGroupImpact(plan, 2, group)).toEqual({
      headline: "2 items will be filed under “Animals”.",
      notes: [],
      nothingToDo: false,
    });
  });

  it("says what is left alone and what is in another level", () => {
    const impact = moveToGroupImpact(
      { moving: 3, alreadyThere: 2, inAnotherLevel: 2 },
      5,
      group,
    );
    expect(impact.notes).toEqual([
      "2 items already in “Animals” are left where they are.",
      "2 items are in a different level from this group (Level 2); they stay where they are.",
    ]);
  });

  it("agrees with a single item", () => {
    const impact = moveToGroupImpact(
      { moving: 1, alreadyThere: 1, inAnotherLevel: 1 },
      2,
      group,
    );
    expect(impact.notes).toEqual([
      "1 item already in “Animals” is left where it is.",
      "1 item is in a different level from this group (Level 2); it stays where it is.",
    ]);
  });

  it("has nothing to confirm when everything is already there", () => {
    const impact = moveToGroupImpact(
      { moving: 0, alreadyThere: 2, inAnotherLevel: 0 },
      2,
      group,
    );
    expect(impact.nothingToDo).toBe(true);
    expect(impact.headline).toBe(
      "All 2 selected items are already in “Animals”. Nothing will change.",
    );
  });
});

describe("moved wording", () => {
  it("reports what moved, and what was already there", () => {
    expect(movedMessage(2, 0, "Level 3")).toBe("Moved 2 items to Level 3.");
    expect(movedMessage(1, 0, "Level 3")).toBe("Moved 1 item to Level 3.");
    expect(movedMessage(2, 1, "“Animals”")).toBe(
      "Moved 2 items to “Animals” (1 already there).",
    );
  });

  it("says plainly when there was nothing left to move", () => {
    expect(movedMessage(0, 2, "Level 3")).toBe(
      "Nothing to move — 2 items already in Level 3.",
    );
  });
});
