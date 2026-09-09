import type { LearningItem, VocabularyItem, VocabularyTheme } from "@/domains/curriculum";
import type { CurriculumMode } from "@/domains/users";

import { getLessonGrammarShare } from "./lesson-config";
import type { LessonBatchItem } from "./lesson-types";

/**
 * Pure, server-authoritative batch selection (spec 07 §2, §10; spec 16's
 * curriculum modes). The single place batch membership is decided — a
 * client-chosen batch is never accepted, and no page or component
 * re-implements any of this.
 *
 * Every mode selects from the same eligible curriculum and obeys the same
 * progression: the mode changes only *which* of the remaining unlearned
 * items comes next. Nothing here reads or writes SRS state, unlocks, or
 * progress, which is what makes "switching modes affects future lessons
 * only" true by construction rather than by care.
 *
 * Theme and Balanced are fully deterministic and therefore directly
 * testable. Random takes an injected number source so it is testable too.
 */

export type SelectLessonBatchInput = {
  /** Unlearned, published items the learner may be taught right now, in any order. */
  eligibleItems: LearningItem[];
  batchSize: number;
  mode: CurriculumMode;
  /** Theme mode's chosen vocabulary group. A batch is empty when this is absent or has nothing left — the caller asks the learner to choose instead of silently picking one. */
  selectedThemeId?: string | null;
  /** Injected only so Random mode is testable; production passes nothing. */
  random?: () => number;
};

function isVocabulary(item: LearningItem): item is VocabularyItem {
  return item.type === "vocabulary";
}

function byLessonPriority(a: LearningItem, b: LearningItem): number {
  if (a.levelNumber !== b.levelNumber) return a.levelNumber - b.levelNumber;
  if (a.lessonPriority !== b.lessonPriority) return a.lessonPriority - b.lessonPriority;
  // Final tiebreak so two items sharing a priority never depend on the
  // order the database happened to return them in.
  return a.id.localeCompare(b.id);
}

/**
 * Spec 16 scopes every mode to "the current Level": the lowest level that
 * still has anything left to teach. Doing it explicitly matters for Random
 * and Balanced, which have no inherent ordering to fall back on and would
 * otherwise happily mix a Level 1 word into a Level 3 lesson.
 */
function currentLevelItems(eligibleItems: LearningItem[]): LearningItem[] {
  if (eligibleItems.length === 0) return [];
  const currentLevel = Math.min(...eligibleItems.map((item) => item.levelNumber));
  return eligibleItems.filter((item) => item.levelNumber === currentLevel);
}

/** Fisher-Yates over a copy, driven by the injected source, so Random mode is uniform rather than sort-comparator "random". */
function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * The themes a learner could pick right now: every vocabulary group with at
 * least one eligible item in the current level, in curriculum order. A theme
 * whose items are all learned simply stops being offered, which is what
 * makes "after a theme is completed, the learner chooses another" work
 * without tracking theme completion separately (spec 16's scope limit: no
 * permanent per-theme progress system).
 */
export function getAvailableThemes(eligibleItems: LearningItem[]): VocabularyTheme[] {
  const byId = new Map<string, VocabularyTheme>();
  for (const item of currentLevelItems(eligibleItems)) {
    if (!isVocabulary(item) || !item.theme) continue;
    if (!byId.has(item.theme.id)) byId.set(item.theme.id, item.theme);
  }
  return [...byId.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/**
 * Round-robin across themes in curriculum order, each theme contributing its
 * own items in lesson-priority order. A theme that runs out simply stops
 * contributing and the remaining themes absorb its share, which is spec 16's
 * "redistribute naturally when a theme has fewer remaining items" — no
 * attempt is made to force exactly equal counts.
 */
function selectBalancedVocabulary(vocabulary: VocabularyItem[], slots: number): VocabularyItem[] {
  const queues = new Map<string, VocabularyItem[]>();
  for (const item of [...vocabulary].sort(byLessonPriority)) {
    const key = item.theme?.id ?? "";
    const queue = queues.get(key) ?? [];
    queue.push(item);
    queues.set(key, queue);
  }

  const ordered = [...queues.entries()].sort(([, a], [, b]) => {
    const first = a[0]!;
    const second = b[0]!;
    const positionDifference = (first.theme?.position ?? Number.MAX_SAFE_INTEGER) - (second.theme?.position ?? Number.MAX_SAFE_INTEGER);
    return positionDifference !== 0 ? positionDifference : byLessonPriority(first, second);
  });

  const selected: VocabularyItem[] = [];
  let round = 0;
  while (selected.length < slots) {
    const before = selected.length;
    for (const [, queue] of ordered) {
      if (selected.length >= slots) break;
      const item = queue[round];
      if (item) selected.push(item);
    }
    if (selected.length === before) break; // every queue is exhausted
    round += 1;
  }
  return selected;
}

/**
 * Builds the next lesson batch for one learner under one curriculum mode.
 *
 * Non-random modes reserve a share of the batch for grammar, sized from the
 * configured curriculum shape (`getLessonGrammarShare`) rather than a magic
 * number, and fill it in the grammar curriculum's own order — spec 16's
 * "grammar sequencing stays authoritative to the existing grammar
 * curriculum configuration", untouched by which vocabulary theme is active.
 *
 * The reserved share is a pace, not a filler. When the vocabulary side comes
 * up short the batch is simply shorter — grammar does not expand to fill it,
 * because a nearly-finished theme would otherwise produce a lesson that is
 * mostly grammar. That is what makes spec 16's example literal: a theme with
 * one item left really does yield a one-item vocabulary portion, never
 * padded from another theme.
 *
 * The one exception is a level whose vocabulary is entirely learned. With no
 * vocabulary left to pace against, grammar fills the whole batch rather than
 * trickling out one item per lesson.
 */
export function selectLessonBatch({
  eligibleItems,
  batchSize,
  mode,
  selectedThemeId,
  random = Math.random,
}: SelectLessonBatchInput): LearningItem[] {
  if (batchSize <= 0) return [];
  const candidates = currentLevelItems(eligibleItems);
  if (candidates.length === 0) return [];

  if (mode === "random") {
    // Random is the one mode spec 16 allows to mix grammar and vocabulary
    // freely, so it deliberately skips the reservation below.
    return shuffle(candidates, random).slice(0, batchSize);
  }

  const grammar = candidates.filter((item) => item.type === "grammar").sort(byLessonPriority);
  const vocabulary = candidates.filter(isVocabulary).sort(byLessonPriority);

  const reservedGrammar = Math.min(grammar.length, Math.round(batchSize * getLessonGrammarShare()));
  const vocabularySlots = batchSize - reservedGrammar;

  if (mode === "theme" && !selectedThemeId) {
    // Undecidable rather than empty: the caller (`startLesson`) turns this
    // into "choose a theme". Selecting grammar alone here would quietly
    // teach around the learner's unanswered choice.
    return [];
  }

  const selectedVocabulary =
    mode === "theme"
      ? vocabulary.filter((item) => item.theme?.id === selectedThemeId).slice(0, vocabularySlots)
      : selectBalancedVocabulary(vocabulary, vocabularySlots);

  const grammarSlots = selectedVocabulary.length === 0 ? batchSize : reservedGrammar;
  const selectedGrammar = grammar.slice(0, grammarSlots);

  return [...selectedVocabulary, ...selectedGrammar];
}

export function toLessonBatchItems(items: LearningItem[]): LessonBatchItem[] {
  return items.map((item) => ({ itemId: item.id, itemType: item.type }));
}
