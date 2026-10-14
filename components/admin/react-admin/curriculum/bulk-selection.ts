import type { AdminCurriculumRow } from "@/domains/admin";

/**
 * What each bulk command would do to the rows an Admin has selected, worked out
 * from the rows themselves (spec 26 Unit 7: "do not assume all selected items
 * can be archived or published — show validation and impact").
 *
 * Nothing here decides anything. The server re-checks every one of these
 * against the database inside the transaction and refuses a batch that no
 * longer fits; this is only so the person is told what a command will do, and
 * is never offered one that cannot work, before they press it. Pure, so every
 * rule can be stated and tested without React.
 */

/** The facts about a row the commands care about. */
export type BulkRow = Pick<
  AdminCurriculumRow,
  "id" | "type" | "status" | "levelId" | "levelNumber" | "groupId" | "itemLabel"
>;

/** "1 item", "3 items". */
export function itemCount(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------------- */
/* Publish                                                                    */
/* ------------------------------------------------------------------------- */

export type PublishPlan = {
  /** Every selected row is Pending, so the batch can be sent. */
  canPublish: boolean;
  /** The selected rows that are Pending. */
  pending: BulkRow[];
  /** How many selected rows are not Pending (published, with unpublished changes, or archived). */
  notPending: number;
};

/**
 * Only a **Pending** item can be published in bulk — the service refuses the
 * whole batch if any item in it is anything else. A published item's edits are
 * released one at a time from the review queue, with their version check.
 */
export function publishPlan(rows: readonly BulkRow[]): PublishPlan {
  const pending = rows.filter((row) => row.status === "pending");
  return {
    canPublish: rows.length > 0 && pending.length === rows.length,
    pending,
    notPending: rows.length - pending.length,
  };
}

/* ------------------------------------------------------------------------- */
/* Archive                                                                    */
/* ------------------------------------------------------------------------- */

export type ArchivePlan = {
  /** Rows that will actually be archived. */
  archiving: number;
  /** Rows that are already archived: left exactly as they are. */
  alreadyArchived: number;
  /** Rows that are live to learners right now and will disappear for them. */
  live: number;
  /** Rows with an open, unpublished edit, which archiving throws away. */
  withUnpublishedChanges: number;
};

/**
 * Archiving takes anything out of learners' sight except what is already
 * archived. A published item with unpublished changes shows as `draft`;
 * archiving it discards those changes.
 */
export function archivePlan(rows: readonly BulkRow[]): ArchivePlan {
  const toArchive = rows.filter((row) => row.status !== "archived");
  return {
    archiving: toArchive.length,
    alreadyArchived: rows.length - toArchive.length,
    live: toArchive.filter(
      (row) => row.status === "published" || row.status === "draft",
    ).length,
    withUnpublishedChanges: toArchive.filter((row) => row.status === "draft")
      .length,
  };
}

/* ------------------------------------------------------------------------- */
/* Move                                                                       */
/* ------------------------------------------------------------------------- */

export type MoveToLevelPlan = {
  /** Rows that will move. */
  moving: number;
  /** Rows already in that level: left where they are (not sent to the end of it). */
  alreadyThere: number;
  /** Moving rows that learners can see now: they appear in the new level at once. */
  live: number;
  /** Moving grammar items that are filed under a group: a group belongs to one level, so they lose it. */
  losingTheirGroup: number;
  /** Moving vocabulary items: they keep their group until moved to another. */
  keepingTheirGroup: number;
};

export function moveToLevelPlan(
  rows: readonly BulkRow[],
  levelId: string,
): MoveToLevelPlan {
  const moving = rows.filter((row) => row.levelId !== levelId);
  return {
    moving: moving.length,
    alreadyThere: rows.length - moving.length,
    live: moving.filter(
      (row) => row.status === "published" || row.status === "draft",
    ).length,
    losingTheirGroup: moving.filter(
      (row) => row.type === "grammar" && row.groupId !== null,
    ).length,
    keepingTheirGroup: moving.filter((row) => row.type === "vocabulary").length,
  };
}

export type MoveToGroupPlan = {
  moving: number;
  /** Rows already in that group: left as they are. */
  alreadyThere: number;
  /** Moving rows whose level differs from the group's own level: allowed, but worth saying. */
  inAnotherLevel: number;
};

export function moveToGroupPlan(
  rows: readonly BulkRow[],
  group: { id: string; levelNumber: number },
): MoveToGroupPlan {
  const moving = rows.filter((row) => row.groupId !== group.id);
  return {
    moving: moving.length,
    alreadyThere: rows.length - moving.length,
    inAnotherLevel: moving.filter(
      (row) => row.levelNumber !== group.levelNumber,
    ).length,
  };
}
