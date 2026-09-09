import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  acceptedAnswers,
  grammarItems,
  learningItemSentences,
  learningItems,
  levels,
  sentences,
  userItemProgress,
  userLevelProgress,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";

import type { CurriculumExample, GrammarItem, LearningItem, VocabularyItem } from "./curriculum-types";

/**
 * Real, database-backed curriculum reads shaped for the lesson flow (spec 07
 * unit 6's "Curriculum-data caveat"). This is the module that closes the gap
 * the spec named: `domains/lessons` previously consumed
 * `curriculum-fixtures.ts`, whose toy string IDs cannot be written into
 * `user_item_progress` because that table's foreign keys require real
 * `learning_items` rows.
 *
 * It deliberately keeps `curriculum-types.ts`'s `LearningItem` shape rather
 * than handing `domains/lessons` the raw row types. That shape is the
 * lesson/quiz UI's contract, already built and browser-verified across spec
 * 07 units 1–5 and 7; changing the data source should not churn the
 * interface. The fixture module survives only as unit-test data.
 *
 * Injected `DbClient`, never the `db` singleton — same rule as every other
 * repository here.
 */

/** Only published curriculum is ever teachable. A draft or archived item must never enter a lesson batch. */
const PUBLISHED = "published" as const;

type AcceptedAnswerRow = { learningItemId: string; side: "term" | "meaning"; value: string };

function groupAcceptedAnswers(rows: AcceptedAnswerRow[]): Map<string, { term: string[]; meaning: string[] }> {
  const byItem = new Map<string, { term: string[]; meaning: string[] }>();
  for (const row of rows) {
    const entry = byItem.get(row.learningItemId) ?? { term: [], meaning: [] };
    entry[row.side].push(row.value);
    byItem.set(row.learningItemId, entry);
  }
  return byItem;
}

function groupExamples(
  rows: { learningItemId: string; targetText: string; translation: string }[],
): Map<string, CurriculumExample[]> {
  const byItem = new Map<string, CurriculumExample[]>();
  for (const row of rows) {
    const list = byItem.get(row.learningItemId) ?? [];
    list.push({ targetText: row.targetText, englishText: row.translation });
    byItem.set(row.learningItemId, list);
  }
  return byItem;
}

/**
 * Loads full lesson content for a known set of learning-item IDs, in a bounded
 * number of queries regardless of how many IDs are asked for (never one query
 * per item).
 *
 * Silently omits any ID that does not resolve to a *published* item — callers
 * treat a client-supplied ID as a request, never as proof the item exists or
 * is teachable, and compare lengths themselves when they need to detect that.
 */
export async function getLessonItemsByIds(db: DbClient, ids: string[]): Promise<LearningItem[]> {
  if (ids.length === 0) return [];

  const baseRows = await db
    .select({
      id: learningItems.id,
      languageId: learningItems.languageId,
      type: learningItems.type,
      lessonPriority: learningItems.lessonPriority,
      levelNumber: levels.levelNumber,
    })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .where(and(inArray(learningItems.id, ids), eq(learningItems.status, PUBLISHED), eq(levels.status, PUBLISHED)));

  if (baseRows.length === 0) return [];
  const resolvedIds = baseRows.map((row) => row.id);

  const [vocabularyRows, grammarRows, answerRows, exampleRows] = await Promise.all([
    // Joined rather than fetched separately: every theme-based curriculum
    // mode (spec 16) needs the group's name and position on the item
    // itself, and a second query per group would be an N+1 in disguise.
    db
      .select({
        item: vocabularyItems,
        theme: { id: vocabularyGroups.id, name: vocabularyGroups.name, position: vocabularyGroups.position },
      })
      .from(vocabularyItems)
      .innerJoin(vocabularyGroups, eq(vocabularyGroups.id, vocabularyItems.vocabularyGroupId))
      .where(inArray(vocabularyItems.learningItemId, resolvedIds)),
    db.select().from(grammarItems).where(inArray(grammarItems.learningItemId, resolvedIds)),
    db
      .select({ learningItemId: acceptedAnswers.learningItemId, side: acceptedAnswers.side, value: acceptedAnswers.value })
      .from(acceptedAnswers)
      .where(inArray(acceptedAnswers.learningItemId, resolvedIds)),
    db
      .select({
        learningItemId: learningItemSentences.learningItemId,
        targetText: sentences.targetText,
        translation: sentences.translation,
      })
      .from(learningItemSentences)
      .innerJoin(sentences, eq(sentences.id, learningItemSentences.sentenceId))
      .where(and(inArray(learningItemSentences.learningItemId, resolvedIds), eq(sentences.status, PUBLISHED)))
      .orderBy(asc(learningItemSentences.position)),
  ]);

  const vocabularyById = new Map(vocabularyRows.map((row) => [row.item.learningItemId, row]));
  const grammarById = new Map(grammarRows.map((row) => [row.learningItemId, row]));
  const answersById = groupAcceptedAnswers(answerRows);
  const examplesById = groupExamples(exampleRows);

  const items: LearningItem[] = [];
  for (const base of baseRows) {
    const answers = answersById.get(base.id) ?? { term: [], meaning: [] };
    const examples = examplesById.get(base.id) ?? [];

    if (base.type === "vocabulary") {
      const row = vocabularyById.get(base.id);
      // A learning item whose type-specific row is missing is a broken row,
      // not a lesson item. Skipping is right; rendering half an item is not.
      if (!row) continue;
      const detail = row.item;
      const vocabulary: VocabularyItem = {
        type: "vocabulary",
        id: base.id,
        languageId: base.languageId,
        levelNumber: base.levelNumber,
        lessonPriority: base.lessonPriority,
        word: detail.term,
        ...(detail.article ? { article: detail.article } : {}),
        partOfSpeech: detail.partOfSpeech,
        ...(detail.definition ? { definition: detail.definition } : {}),
        // Index 0 is the primary meaning by contract; admin-authored
        // alternatives follow it and are accepted but never displayed first.
        meanings: [detail.primaryMeaning, ...answers.meaning],
        targetVariants: answers.term,
        theme: row.theme,
        pronunciation: {
          ...(detail.pronunciation ? { guide: detail.pronunciation } : {}),
          ...(detail.ipa ? { ipa: detail.ipa } : {}),
        },
        ...(detail.context ? { context: detail.context } : {}),
        examples,
        ...(detail.creatorNotes ? { creatorNotes: detail.creatorNotes } : {}),
        // `media`/R2 does not exist yet, so there is nothing to link.
        resources: [],
      };
      items.push(vocabulary);
      continue;
    }

    const detail = grammarById.get(base.id);
    if (!detail) continue;
    const grammar: GrammarItem = {
      type: "grammar",
      id: base.id,
      languageId: base.languageId,
      levelNumber: base.levelNumber,
      lessonPriority: base.lessonPriority,
      structure: detail.structure,
      meaning: detail.primaryMeaning,
      explanation: detail.explanation,
      examples,
      ...(detail.creatorNotes ? { creatorNotes: detail.creatorNotes } : {}),
      resources: [],
      requiredQuestions: detail.requiredQuestions,
    };
    items.push(grammar);
  }

  // Caller-supplied order is not meaningful; lesson ordering is
  // `domains/lessons`' concern and it sorts by level then lesson priority.
  return items;
}

/**
 * Every published item in a level the user has unlocked, in the language,
 * that the user has **not** already enrolled.
 *
 * The already-learned exclusion is the half that could not exist before
 * `domains/progress` did: a lesson must never re-teach an item that already
 * has SRS state, and doing the filter in SQL keeps it correct regardless of
 * how large the curriculum grows.
 *
 * The unlocked-level restriction closes a real gap found 2026-09-07: this
 * query previously only checked `learningItems.status`/`levels.status`,
 * never `user_level_progress`, so a learner with only Level 1 unlocked
 * could be served — and enroll in — a Level 2 item in their very first
 * lesson. Every real user has a Level 1 `user_level_progress` row from
 * provisioning (`domains/users/user-repository.ts`), so this needs no
 * special-casing for a brand-new account.
 */
export async function getEligibleLessonItems(
  db: DbClient,
  userId: string,
  languageId: string,
): Promise<LearningItem[]> {
  const enrolled = db
    .select({ learningItemId: userItemProgress.learningItemId })
    .from(userItemProgress)
    .where(eq(userItemProgress.userId, userId));

  const unlockedLevels = db
    .select({ levelId: userLevelProgress.levelId })
    .from(userLevelProgress)
    .where(eq(userLevelProgress.userId, userId));

  const rows = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .where(
      and(
        eq(learningItems.languageId, languageId),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
        inArray(learningItems.levelId, unlockedLevels),
        notInArray(learningItems.id, enrolled),
      ),
    )
    .orderBy(asc(levels.levelNumber), asc(learningItems.lessonPriority), asc(learningItems.id));

  return getLessonItemsByIds(db, rows.map((row) => row.id));
}

/**
 * Which of `learningItemIds` the user already has progress for. Used by the
 * final completion revalidation (spec 07 §44) to reject a replayed batch
 * rather than silently skipping duplicates.
 */
export async function getEnrolledItemIds(db: DbClient, userId: string, learningItemIds: string[]): Promise<string[]> {
  if (learningItemIds.length === 0) return [];
  const rows = await db
    .select({ learningItemId: userItemProgress.learningItemId })
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), inArray(userItemProgress.learningItemId, learningItemIds)));
  return rows.map((row) => row.learningItemId);
}
