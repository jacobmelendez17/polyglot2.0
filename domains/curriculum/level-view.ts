import type { CurriculumLearningItem } from "./curriculum-db-types";

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
};

export type LevelViewModel = {
  grammar: LevelCardItem[];
  vocabulary: LevelCardItem[];
};

function toCardItem(item: CurriculumLearningItem): LevelCardItem {
  if (item.type === "vocabulary") {
    const { term, article, primaryMeaning } = item.vocabulary;
    return {
      id: item.id,
      itemType: "vocabulary",
      // Composed here, once, server-side — never re-derived in a UI component (spec 10 §13).
      primary: article ? `${article} ${term}` : term,
      secondary: primaryMeaning,
    };
  }

  return { id: item.id, itemType: "grammar", primary: item.grammar.structure, secondary: item.grammar.primaryMeaning };
}

/**
 * Splits a level's already curriculum-ordered items (`getLevelItems`
 * orders by `position`) into Grammar and Vocabulary card lists, preserving
 * that order within each — never re-sorting by insertion, id, or alphabet
 * (spec 10 §27). Pure and React-free so ordering/empty-state behavior is
 * unit-testable on its own (spec 10 §36).
 */
export function buildLevelViewModel(items: CurriculumLearningItem[]): LevelViewModel {
  const grammar: LevelCardItem[] = [];
  const vocabulary: LevelCardItem[] = [];

  for (const item of items) {
    const card = toCardItem(item);
    if (item.type === "grammar") grammar.push(card);
    else vocabulary.push(card);
  }

  return { grammar, vocabulary };
}
