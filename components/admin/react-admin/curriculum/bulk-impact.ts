import {
  itemCount,
  type ArchivePlan,
  type MoveToGroupPlan,
  type MoveToLevelPlan,
  type PublishPlan,
} from "./bulk-selection";

/**
 * The words for what a bulk command will do and what it did (spec 26 Unit 7:
 * "show validation and impact"), built from the plans in `bulk-selection.ts`.
 * Pure, so every sentence can be checked without rendering anything.
 *
 * Each sentence is stated only as far as the code guarantees it (architecture
 * invariant 50: archiving withdraws curriculum from browsing and from new
 * lessons, and never deletes or resets learner progress).
 */

const be = (count: number) => (count === 1 ? "is" : "are");
const have = (count: number) => (count === 1 ? "has" : "have");
const itOrThey = (count: number) => (count === 1 ? "it is" : "they are");
const countOf = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/* ------------------------------------------------------------------------- */
/* Publish                                                                    */
/* ------------------------------------------------------------------------- */

/** Why Publish is unavailable, shown beside the disabled button. */
export function publishBlockedNote(plan: PublishPlan): string {
  const { notPending } = plan;
  return `Publish needs every selected item to be Pending — ${notPending} ${
    notPending === 1 ? "isn't" : "aren't"
  }.`;
}

export function publishedMessage(published: number): string {
  return `Published ${itemCount(published)}.`;
}

/* ------------------------------------------------------------------------- */
/* Archive                                                                    */
/* ------------------------------------------------------------------------- */

export function archiveNotes(plan: ArchivePlan): string[] {
  const notes: string[] = [];
  if (plan.live > 0) {
    notes.push(
      `${itemCount(plan.live)} ${be(plan.live)} live to learners and will be withdrawn from them.`,
    );
  }
  if (plan.withUnpublishedChanges > 0) {
    notes.push(
      `${itemCount(plan.withUnpublishedChanges)} ${have(plan.withUnpublishedChanges)} unpublished changes, which archiving discards.`,
    );
  }
  if (plan.alreadyArchived > 0) {
    notes.push(
      `${itemCount(plan.alreadyArchived)} ${be(plan.alreadyArchived)} already archived and will be left as ${itOrThey(plan.alreadyArchived)}.`,
    );
  }
  return notes;
}

export function archivedMessage(
  archived: number,
  alreadyArchived: number,
): string {
  if (archived === 0) {
    return `Nothing to archive — ${itemCount(alreadyArchived)} already archived.`;
  }
  return alreadyArchived > 0
    ? `Archived ${itemCount(archived)} (${alreadyArchived} already archived).`
    : `Archived ${itemCount(archived)}.`;
}

/* ------------------------------------------------------------------------- */
/* Move                                                                       */
/* ------------------------------------------------------------------------- */

export type MoveImpact = {
  /** What the move will do, first. */
  headline: string;
  /** Anything else worth knowing before confirming. */
  notes: string[];
  /** Nothing would change, so there is nothing to confirm. */
  nothingToDo: boolean;
};

export function moveToLevelImpact(
  plan: MoveToLevelPlan,
  total: number,
  levelNumber: number,
): MoveImpact {
  if (plan.moving === 0) {
    return {
      headline: `${total === 1 ? "The selected item is" : `All ${total} selected items are`} already in Level ${levelNumber}. Nothing will change.`,
      notes: [],
      nothingToDo: true,
    };
  }

  const notes: string[] = [];
  if (plan.alreadyThere > 0) {
    notes.push(
      `${itemCount(plan.alreadyThere)} already in Level ${levelNumber} ${be(plan.alreadyThere)} left where ${itOrThey(plan.alreadyThere)}.`,
    );
  }
  if (plan.live > 0) {
    notes.push(
      `${itemCount(plan.live)} ${be(plan.live)} live to learners and will change level for them straight away.`,
    );
  }
  if (plan.losingTheirGroup > 0) {
    notes.push(
      `${countOf(plan.losingTheirGroup, "grammar item")} filed under a group will lose it — a group belongs to one level.`,
    );
  }
  if (plan.keepingTheirGroup > 0) {
    notes.push(`Vocabulary keeps its group; use Move to group to change that.`);
  }
  return {
    headline: `${itemCount(plan.moving)} will move to Level ${levelNumber}, to the end of its order.`,
    notes,
    nothingToDo: false,
  };
}

export function moveToGroupImpact(
  plan: MoveToGroupPlan,
  total: number,
  group: { name: string; levelNumber: number },
): MoveImpact {
  if (plan.moving === 0) {
    return {
      headline: `${total === 1 ? "The selected item is" : `All ${total} selected items are`} already in “${group.name}”. Nothing will change.`,
      notes: [],
      nothingToDo: true,
    };
  }

  const notes: string[] = [];
  if (plan.alreadyThere > 0) {
    notes.push(
      `${itemCount(plan.alreadyThere)} already in “${group.name}” ${be(plan.alreadyThere)} left where ${itOrThey(plan.alreadyThere)}.`,
    );
  }
  if (plan.inAnotherLevel > 0) {
    notes.push(
      `${itemCount(plan.inAnotherLevel)} ${be(plan.inAnotherLevel)} in a different level from this group (Level ${group.levelNumber}); ${plan.inAnotherLevel === 1 ? "it stays" : "they stay"} where ${itOrThey(plan.inAnotherLevel)}.`,
    );
  }
  return {
    headline: `${itemCount(plan.moving)} will be filed under “${group.name}”.`,
    notes,
    nothingToDo: false,
  };
}

export function movedMessage(
  moved: number,
  alreadyThere: number,
  to: string,
): string {
  if (moved === 0) {
    return `Nothing to move — ${itemCount(alreadyThere)} already in ${to}.`;
  }
  return alreadyThere > 0
    ? `Moved ${itemCount(moved)} to ${to} (${alreadyThere} already there).`
    : `Moved ${itemCount(moved)} to ${to}.`;
}
