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

export type LevelCardItem = {
  id: string;
  itemType: "vocabulary" | "grammar";
  /** Large, visually dominant text — the target-language term (with article where applicable) or the grammar structure. */
  primary: string;
  /** Smaller, muted text beneath — the English meaning/short description. */
  secondary: string;
  /** The viewer's current SRS stage for this item, or `null` when not yet learned (spec 26's per-card stage color). Never a fabricated "locked" state — see `buildLevelViewModel`'s docstring. */
  srsStage: SrsStage | null;
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
    };
  }

  return {
    id: item.id,
    itemType: "grammar",
    primary: item.grammar.structure,
    secondary: item.grammar.primaryMeaning,
    srsStage,
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
 * Every item without a `progressByItemId` entry renders as "not learned
 * yet" (`srsStage: null`) — spec 26's redesign describes a mockup with
 * separate "Locked" and "In lessons" states for such items, implying groups
 * unlock in sequence. That isn't how curriculum selection actually works
 * (Choose Group as You Go lets a learner pick any group; Default Order and
 * Variety don't lock later groups from view either), so inventing a
 * lock/unlock split here would be undocumented product behavior. Every
 * group's items render fully; only real SRS stage is ever colored.
 */
export function buildLevelViewModel(
  items: CurriculumLearningItem[],
  groups: CurriculumVocabularyGroup[],
  progressByItemId: ReadonlyMap<string, SrsStage>,
): LevelViewModel {
  const grammar: LevelCardItem[] = [];
  const vocabularyByGroup = new Map<string, LevelCardItem[]>();

  for (const item of items) {
    const card = toCardItem(item, progressByItemId.get(item.id) ?? null);
    if (item.type === "grammar") {
      grammar.push(card);
    } else {
      const groupId = item.vocabulary.vocabularyGroupId;
      const existing = vocabularyByGroup.get(groupId);
      if (existing) existing.push(card);
      else vocabularyByGroup.set(groupId, [card]);
    }
  }

  const lessons: LevelLessonSection[] = groups
    .map((group) => {
      const items = vocabularyByGroup.get(group.id) ?? [];
      return {
        groupId: group.id,
        lessonNumber: group.position,
        name: group.name,
        items,
        qualifyingCount: items.filter(
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
