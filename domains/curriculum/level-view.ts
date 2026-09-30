import {
  isStageAtLeast,
  LEVEL_UNLOCK_MINIMUM_STAGE,
} from "@/domains/srs";
import type { SrsStage } from "@/domains/srs";

import type {
  CurriculumLearningItem,
  CurriculumVocabularyGroup,
} from "./curriculum-db-types";

/** Spec 10 §2 — the Levels feature covers exactly this range; the route param's validity is checked against it, not against how many `levels` rows actually exist yet. */
export const LEVEL_NUMBER_MIN = 1;
export const LEVEL_NUMBER_MAX = 50;

/**
 * Parses and validates a `/levels/[level]` route param (spec 10 §2). Pure —
 * no React, so it's independently testable per spec 10 §36. Rejects
 * anything that isn't a plain base-10 integer in range: non-numeric
 * strings, decimals, leading/trailing junk, and out-of-range values all
 * return `null`, which the route treats as not-found.
 */
export function parseLevelNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (value < LEVEL_NUMBER_MIN || value > LEVEL_NUMBER_MAX) return null;
  return value;
}

/**
 * A card's presentation bucket, derived once here rather than re-derived per
 * component. `learned` is simply "has a real progress row." `inLesson` and
 * `locked` both mean "no progress yet" — they exist only for vocabulary,
 * which is grouped into lessons and therefore has a well-defined "which
 * lesson is next" (see `buildLevelViewModel`'s docstring for exactly what
 * that means and doesn't mean); grammar has no such grouping, so an
 * unlearned grammar item is always `locked` — a plain "nothing recorded
 * yet," never a claim that any lesson is inaccessible.
 */
export type LevelItemDisplayState = "learned" | "inLesson" | "locked";

export type LevelCardItem = {
  id: string;
  itemType: "vocabulary" | "grammar";
  /** Large, visually dominant text — the target-language term (with article where applicable) or the grammar structure. */
  primary: string;
  /** Smaller, muted text beneath — the English meaning/short description. */
  secondary: string;
  /** The viewer's current SRS stage for this item, or `null` when not yet learned. */
  srsStage: SrsStage | null;
  displayState: LevelItemDisplayState;
};

/** One vocabulary group rendered as a "Lesson N" section (spec 26) — a group's position *is* its lesson number, not a separately authored field. */
export type LevelLessonSection = {
  groupId: string;
  lessonNumber: number;
  name: string;
  items: LevelCardItem[];
  /** How many of this lesson's items have reached the real unlock threshold (`LEVEL_UNLOCK_MINIMUM_STAGE`) — the same "Familiar+" line the header's progress bar uses, never a separate ad hoc threshold. */
  qualifyingCount: number;
};

export type LevelViewModel = {
  grammar: LevelCardItem[];
  /** Ordered by lesson number. A group with no published items yet is omitted entirely — an empty lesson section is clutter, not information (spec 26 §22's "don't render empty sections" rule, applied here too). */
  lessons: LevelLessonSection[];
  counts: {
    grammarCount: number;
    vocabularyCount: number;
    lessonCount: number;
  };
};

function toCardItem(
  item: CurriculumLearningItem,
  srsStage: SrsStage | null,
  displayState: LevelItemDisplayState,
): LevelCardItem {
  if (item.type === "vocabulary") {
    const { term, article, primaryMeaning } = item.vocabulary;
    return {
      id: item.id,
      itemType: "vocabulary",
      // Composed here, once, server-side — never re-derived in a UI component (spec 10 §13).
      primary: article ? `${article} ${term}` : term,
      secondary: primaryMeaning,
      srsStage,
      displayState,
    };
  }

  return {
    id: item.id,
    itemType: "grammar",
    primary: item.grammar.structure,
    secondary: item.grammar.primaryMeaning,
    srsStage,
    displayState,
  };
}

/**
 * Splits a level's already curriculum-ordered items (`getLevelItems`
 * orders by `position`) into a flat Grammar list and per-group ("Lesson N")
 * Vocabulary sections, preserving curriculum order throughout — never
 * re-sorting by insertion, id, or alphabet (spec 10 §27). Pure and
 * React-free so ordering/empty-state behavior is unit-testable on its own
 * (spec 10 §36); `progressByItemId` is looked up, never queried, keeping
 * this module database-free like `item-detail-view.ts`.
 *
 * **What `inLesson`/`locked` do and do not mean.** A vocabulary lesson is
 * "fully taught" once every one of its items has *some* progress row — that
 * is a real, already-true fact the moment a lesson session enrolls a batch
 * into SRS (architecture.md's Lesson Architecture), not a guess. The
 * "active" lesson is the earliest lesson (by position) that isn't fully
 * taught yet; its still-unlearned items display as `inLesson`, and every
 * later lesson's unlearned items display as `locked`. This is a *display
 * sequencing convention* for the Level page only — it does not change,
 * gate, or duplicate real lesson eligibility. A learner using "Choose Group
 * as You Go" can still study any group next; clicking straight through to
 * any item's page still works regardless of this coloring. Grammar has no
 * grouping to hang this on, so an unlearned grammar item is always
 * `locked` — meaning only "nothing recorded yet," same as vocabulary's own
 * `locked` cards.
 */
export function buildLevelViewModel(
  items: CurriculumLearningItem[],
  groups: CurriculumVocabularyGroup[],
  progressByItemId: ReadonlyMap<string, SrsStage>,
): LevelViewModel {
  const grammar: LevelCardItem[] = [];
  const vocabularyByGroup = new Map<
    string,
    Extract<CurriculumLearningItem, { type: "vocabulary" }>[]
  >();

  for (const item of items) {
    if (item.type === "grammar") {
      const srsStage = progressByItemId.get(item.id) ?? null;
      grammar.push(toCardItem(item, srsStage, srsStage ? "learned" : "locked"));
      continue;
    }
    const groupId = item.vocabulary.vocabularyGroupId;
    const existing = vocabularyByGroup.get(groupId);
    if (existing) existing.push(item);
    else vocabularyByGroup.set(groupId, [item]);
  }

  // The first group (in position order) that has any item without a
  // progress row yet — every group before it, if any, is fully taught by
  // construction. `undefined` means every group is fully taught.
  const activeGroupId = groups.find((group) =>
    (vocabularyByGroup.get(group.id) ?? []).some(
      (item) => !progressByItemId.has(item.id),
    ),
  )?.id;

  const lessons: LevelLessonSection[] = groups
    .map((group) => {
      const cards = (vocabularyByGroup.get(group.id) ?? []).map((item) => {
        const srsStage = progressByItemId.get(item.id) ?? null;
        const displayState: LevelItemDisplayState = srsStage
          ? "learned"
          : group.id === activeGroupId
            ? "inLesson"
            : "locked";
        return toCardItem(item, srsStage, displayState);
      });
      return {
        groupId: group.id,
        lessonNumber: group.position,
        name: group.name,
        items: cards,
        qualifyingCount: cards.filter(
          (item) =>
            item.srsStage !== null &&
            isStageAtLeast(item.srsStage, LEVEL_UNLOCK_MINIMUM_STAGE),
        ).length,
      };
    })
    .filter((lesson) => lesson.items.length > 0);

  const vocabularyCount = lessons.reduce(
    (sum, lesson) => sum + lesson.items.length,
    0,
  );

  return {
    grammar,
    lessons,
    counts: {
      grammarCount: grammar.length,
      vocabularyCount,
      lessonCount: lessons.length,
    },
  };
}
