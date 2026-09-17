import type {
  LearningItem,
  VocabularyItem,
  VocabularyTheme,
} from "@/domains/curriculum";
import type { CurriculumMode, GrammarPlacement } from "@/domains/users";

import type { LessonBatchItem } from "./lesson-types";

/**
 * Pure, server-authoritative batch selection (spec 07 §2, §10; spec 16's
 * curriculum modes, renamed/consolidated by spec 20's "Learning Queue"). The
 * single place batch membership is decided — a client-chosen batch is never
 * accepted, and no page or component re-implements any of this.
 *
 * Every mode selects from the same eligible curriculum and obeys the same
 * progression: the mode changes only *which* of the remaining unlearned
 * items comes next. Nothing here reads or writes SRS state, unlocks, or
 * progress, which is what makes "switching modes affects future lessons
 * only" true by construction rather than by care.
 *
 * All three modes are fully deterministic — spec 20 removed the one mode
 * (old "random") that wasn't, so this domain no longer needs an injected
 * random source at all.
 */

export type SelectLessonBatchInput = {
  /** Unlearned, published items the learner may be taught right now, in any order. */
  eligibleItems: LearningItem[];
  batchSize: number;
  mode: CurriculumMode;
  /** Choose Group as You Go's chosen vocabulary group. A batch is empty when this is absent or has nothing left — the caller asks the learner to choose instead of silently picking one. */
  selectedThemeId?: string | null;
  /** Meaningful only in `variety` mode (spec 20 Lessons — Grammar Placement). Defaults to "no_preference", matching the stored default. */
  grammarPlacement?: GrammarPlacement;
};

function isVocabulary(item: LearningItem): item is VocabularyItem {
  return item.type === "vocabulary";
}

function byLessonPriority(a: LearningItem, b: LearningItem): number {
  if (a.levelNumber !== b.levelNumber) return a.levelNumber - b.levelNumber;
  if (a.lessonPriority !== b.lessonPriority)
    return a.lessonPriority - b.lessonPriority;
  // Final tiebreak so two items sharing a priority never depend on the
  // order the database happened to return them in.
  return a.id.localeCompare(b.id);
}

/** Vocabulary in authored order: by group position, then lesson priority within the group — Default Order's "Group 1, then Group 2, ..." (spec 20). */
function byGroupThenPriority(a: VocabularyItem, b: VocabularyItem): number {
  const positionDifference =
    (a.theme?.position ?? Number.MAX_SAFE_INTEGER) -
    (b.theme?.position ?? Number.MAX_SAFE_INTEGER);
  return positionDifference !== 0 ? positionDifference : byLessonPriority(a, b);
}

/**
 * Spec 16 scopes every mode to "the current Level": the lowest level that
 * still has anything left to teach. Doing it explicitly matters for modes
 * with no inherent cross-level ordering to fall back on and would otherwise
 * happily mix a Level 1 word into a Level 3 lesson.
 */
function currentLevelItems(eligibleItems: LearningItem[]): LearningItem[] {
  if (eligibleItems.length === 0) return [];
  const currentLevel = Math.min(
    ...eligibleItems.map((item) => item.levelNumber),
  );
  return eligibleItems.filter((item) => item.levelNumber === currentLevel);
}

/**
 * How much of a batch grammar should take, derived from what this level
 * still has left rather than from a configured curriculum shape.
 *
 * Levels are flexible — any level may hold any number of vocabulary and
 * grammar items (spec 17) — so a fixed 48:12 assumption would pace a level
 * of 200 words and 3 grammar points exactly as badly as a level of 10 and
 * 10. Taking the ratio from the remaining eligible pool means both sides
 * run out at roughly the same time, whatever shape the level is.
 */
function grammarShareOf(vocabularyCount: number, grammarCount: number): number {
  const total = vocabularyCount + grammarCount;
  return total === 0 ? 0 : grammarCount / total;
}

/**
 * The groups a learner could pick right now: every vocabulary group with at
 * least one eligible item in the current level, in curriculum order. A group
 * whose items are all learned simply stops being offered, which is what
 * makes "after a group is completed, the learner chooses another" work
 * without tracking group completion separately (spec 16's scope limit: no
 * permanent per-group progress system).
 */
export function getAvailableThemes(
  eligibleItems: LearningItem[],
): VocabularyTheme[] {
  const byId = new Map<string, VocabularyTheme>();
  for (const item of currentLevelItems(eligibleItems)) {
    if (!isVocabulary(item) || !item.theme) continue;
    if (!byId.has(item.theme.id)) byId.set(item.theme.id, item.theme);
  }
  return [...byId.values()].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
}

/**
 * Round-robin across vocabulary groups in curriculum order, each group
 * contributing its own items in lesson-priority order — Variety's "pulls a
 * little from each available vocabulary group" (spec 20). A group that runs
 * out simply stops contributing and the remaining groups absorb its share
 * ("redistribute naturally when a group has fewer remaining items") — no
 * attempt is made to force exactly equal counts.
 */
function selectVarietyVocabulary(
  vocabulary: VocabularyItem[],
  slots: number,
): VocabularyItem[] {
  const queues = new Map<string, VocabularyItem[]>();
  for (const item of [...vocabulary].sort(byLessonPriority)) {
    const key = item.theme?.id ?? "";
    const queue = queues.get(key) ?? [];
    queue.push(item);
    queues.set(key, queue);
  }

  const ordered = [...queues.entries()].sort(([, a], [, b]) =>
    byGroupThenPriority(a[0]!, b[0]!),
  );

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
 * Spreads `secondary` items evenly throughout `primary`, preserving each
 * list's own internal order — Variety + Grammar Placement "No Preference":
 * "grammar remains included, no forced first/last position, normal
 * curriculum logic may interleave it" (spec 20). Deterministic (a running
 * ratio, not randomness) — the eliminated "Random" mode is not being
 * quietly reintroduced here under a different name.
 */
function interleaveEvenly<T>(primary: T[], secondary: T[]): T[] {
  if (secondary.length === 0) return primary;
  if (primary.length === 0) return secondary;

  const result: T[] = [];
  const ratio = secondary.length / (primary.length + secondary.length);
  let secondaryIndex = 0;
  let accumulated = 0;
  for (const item of primary) {
    result.push(item);
    accumulated += ratio;
    while (accumulated >= 1 && secondaryIndex < secondary.length) {
      result.push(secondary[secondaryIndex]!);
      secondaryIndex += 1;
      accumulated -= 1;
    }
  }
  while (secondaryIndex < secondary.length) {
    result.push(secondary[secondaryIndex]!);
    secondaryIndex += 1;
  }
  return result;
}

/**
 * Builds the next lesson batch for one learner under one Learning Queue mode.
 *
 * `default_order` uses the authored sequence directly: grammar (in its own
 * priority order) always first, then vocabulary group by group in position
 * order — a plain slice of one combined, already-correctly-ordered list, so
 * it needs none of the grammar-share reservation below.
 *
 * `choose_group` and `variety` both reserve a share of the batch for
 * grammar, sized from what the level itself still has left to teach, and
 * fill it in the grammar curriculum's own order — spec 20's "grammar
 * follows normal authored progression" / "grammar sequencing stays
 * authoritative to the existing grammar curriculum configuration",
 * untouched by which vocabulary group is active.
 *
 * The reserved share is a pace, not a filler. When the vocabulary side comes
 * up short the batch is simply shorter — grammar does not expand to fill it,
 * because a nearly-finished group would otherwise produce a lesson that is
 * mostly grammar. The one exception is a level whose vocabulary is entirely
 * learned: with no vocabulary left to pace against, grammar fills the whole
 * batch rather than trickling out one item per lesson.
 */
export function selectLessonBatch({
  eligibleItems,
  batchSize,
  mode,
  selectedThemeId,
  grammarPlacement = "no_preference",
}: SelectLessonBatchInput): LearningItem[] {
  if (batchSize <= 0) return [];
  const candidates = currentLevelItems(eligibleItems);
  if (candidates.length === 0) return [];

  const grammar = candidates
    .filter((item) => item.type === "grammar")
    .sort(byLessonPriority);
  const vocabulary = candidates.filter(isVocabulary).sort(byLessonPriority);

  if (mode === "default_order") {
    const ordered = [...grammar, ...[...vocabulary].sort(byGroupThenPriority)];
    return ordered.slice(0, batchSize);
  }

  // Capped at one slot short of the batch whenever vocabulary is available:
  // a level of one word and eleven grammar points rounds to a batch that is
  // *entirely* grammar, which would leave that last word untaught until the
  // grammar ran out. The share decides the pace; this keeps both sides
  // moving.
  const grammarCeiling = vocabulary.length > 0 ? batchSize - 1 : batchSize;
  const reservedGrammar = Math.min(
    grammar.length,
    grammarCeiling,
    Math.round(batchSize * grammarShareOf(vocabulary.length, grammar.length)),
  );
  const vocabularySlots = batchSize - reservedGrammar;

  if (mode === "choose_group" && !selectedThemeId) {
    // Undecidable rather than empty: the caller (`startLesson`) turns this
    // into "choose a group". Selecting grammar alone here would quietly
    // teach around the learner's unanswered choice.
    return [];
  }

  const selectedVocabulary =
    mode === "choose_group"
      ? vocabulary
          .filter((item) => item.theme?.id === selectedThemeId)
          .slice(0, vocabularySlots)
      : selectVarietyVocabulary(vocabulary, vocabularySlots);

  const grammarSlots =
    selectedVocabulary.length === 0 ? batchSize : reservedGrammar;
  const selectedGrammar = grammar.slice(0, grammarSlots);

  // Grammar Placement only applies to Variety — Choose Group as You Go
  // ignores it and always appends grammar after vocabulary (spec 20: "the
  // setting does not affect Choose Group as You Go").
  if (mode === "variety") {
    if (grammarPlacement === "first")
      return [...selectedGrammar, ...selectedVocabulary];
    if (grammarPlacement === "no_preference")
      return interleaveEvenly<LearningItem>(
        selectedVocabulary,
        selectedGrammar,
      );
  }
  return [...selectedVocabulary, ...selectedGrammar];
}

export function toLessonBatchItems(items: LearningItem[]): LessonBatchItem[] {
  return items.map((item) => ({ itemId: item.id, itemType: item.type }));
}
