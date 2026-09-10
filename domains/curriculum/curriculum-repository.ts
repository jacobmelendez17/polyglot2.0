import { and, asc, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  grammarContentBlocks,
  grammarItems,
  languages,
  learningItemResources,
  learningItems,
  learningItemSentences,
  levels,
  sentences,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";

import type {
  CurriculumExampleSentence,
  CurriculumGrammarContentBlock,
  CurriculumGrammarDetail,
  CurriculumItemResource,
  CurriculumLanguage,
  CurriculumLearningItem,
  CurriculumLevel,
  CurriculumVocabularyDetail,
  CurriculumVocabularyGroup,
} from "./curriculum-db-types";

/**
 * Real, database-backed curriculum repository (spec 08 §30). Takes an
 * injected `DbClient` rather than the app's `db` singleton, matching
 * `domains/users/user-repository.ts`'s pattern — see that file and
 * progress-tracker.md for why (`server-only`'s guard throws outside Next's
 * webpack build, including under Vitest).
 */

type LearningItemRow = typeof learningItems.$inferSelect;

function toCurriculumLanguage(row: typeof languages.$inferSelect): CurriculumLanguage {
  return { id: row.id, code: row.code, slug: row.slug, name: row.name };
}

function toCurriculumLevel(row: typeof levels.$inferSelect): CurriculumLevel {
  return {
    id: row.id,
    languageId: row.languageId,
    levelNumber: row.levelNumber,
    name: row.name,
    status: row.status,
    cefrLevel: row.cefrLevel,
  };
}

function toCurriculumVocabularyGroup(row: typeof vocabularyGroups.$inferSelect): CurriculumVocabularyGroup {
  return {
    id: row.id,
    levelId: row.levelId,
    languageId: row.languageId,
    name: row.name,
    position: row.position,
    status: row.status,
  };
}

function toCurriculumVocabularyDetail(row: typeof vocabularyItems.$inferSelect): CurriculumVocabularyDetail {
  return {
    vocabularyGroupId: row.vocabularyGroupId,
    term: row.term,
    primaryMeaning: row.primaryMeaning,
    definition: row.definition,
    article: row.article,
    partOfSpeech: row.partOfSpeech,
    pronunciation: row.pronunciation,
    ipa: row.ipa,
    context: row.context,
    creatorNotes: row.creatorNotes,
    register: row.register,
    dictionaryFieldOverrides: row.dictionaryFieldOverrides,
  };
}

function toCurriculumGrammarDetail(row: typeof grammarItems.$inferSelect): CurriculumGrammarDetail {
  return {
    title: row.title,
    structure: row.structure,
    primaryMeaning: row.primaryMeaning,
    explanation: row.explanation,
    category: row.category,
    creatorNotes: row.creatorNotes,
    register: row.register,
    requiredQuestions: row.requiredQuestions,
  };
}

/**
 * Joins a learning item's shared identity row to its type-specific detail
 * row. One query per item — acceptable for this foundation (no real
 * consumer yet); worth batching if `getLevelItems` ever backs a real,
 * performance-sensitive page.
 */
async function attachDetail(db: DbClient, item: LearningItemRow): Promise<CurriculumLearningItem> {
  const base = {
    id: item.id,
    languageId: item.languageId,
    levelId: item.levelId,
    status: item.status,
    position: item.position,
    lessonPriority: item.lessonPriority,
    version: item.version,
  };

  if (item.type === "vocabulary") {
    const [detail] = await db
      .select()
      .from(vocabularyItems)
      .where(eq(vocabularyItems.learningItemId, item.id))
      .limit(1);
    if (!detail) {
      throw new Error(`Data integrity error: learning item ${item.id} is type "vocabulary" with no vocabulary_items row.`);
    }
    return { ...base, type: "vocabulary", vocabulary: toCurriculumVocabularyDetail(detail) };
  }

  const [detail] = await db.select().from(grammarItems).where(eq(grammarItems.learningItemId, item.id)).limit(1);
  if (!detail) {
    throw new Error(`Data integrity error: learning item ${item.id} is type "grammar" with no grammar_items row.`);
  }
  return { ...base, type: "grammar", grammar: toCurriculumGrammarDetail(detail) };
}

export async function getLanguageByCode(db: DbClient, code: string): Promise<CurriculumLanguage | null> {
  const [row] = await db.select().from(languages).where(eq(languages.code, code)).limit(1);
  return row ? toCurriculumLanguage(row) : null;
}

export async function getLanguageById(db: DbClient, id: string): Promise<CurriculumLanguage | null> {
  const [row] = await db.select().from(languages).where(eq(languages.id, id)).limit(1);
  return row ? toCurriculumLanguage(row) : null;
}

/** Every configured language (spec 11 §10's Language filter dropdown). Small, unbounded table — no pagination needed. */
export async function getLanguages(db: DbClient): Promise<CurriculumLanguage[]> {
  const rows = await db.select().from(languages).orderBy(asc(languages.name));
  return rows.map(toCurriculumLanguage);
}

export async function getLevelById(db: DbClient, levelId: string): Promise<CurriculumLevel | null> {
  const [row] = await db.select().from(levels).where(eq(levels.id, levelId)).limit(1);
  return row ? toCurriculumLevel(row) : null;
}

export async function getLevelsByLanguage(db: DbClient, languageId: string): Promise<CurriculumLevel[]> {
  const rows = await db.select().from(levels).where(eq(levels.languageId, languageId)).orderBy(asc(levels.levelNumber));
  return rows.map(toCurriculumLevel);
}

/**
 * Resolves a level by its learner-facing number within one language (spec
 * 10 §2's `/levels/[level]` route). Returns `null` both for an out-of-range
 * number and for an in-range number with no `levels` row published yet for
 * this language — the caller (spec 10 §29) treats the latter as "content
 * not yet published," not a 404; only the route param's own 1-50 validity
 * is a real not-found case.
 */
/**
 * Whether a read may see curriculum that has not been published.
 *
 * **The default is published-only, deliberately.** Every learner-facing read
 * path was previously unfiltered, so a `draft`, `pending`, or `archived`
 * level or item rendered to learners identically to a published one — which
 * made the entire Admin publish workflow decorative and left withdrawn
 * content visible. Making the safe behavior the default, and the exception
 * explicit at the call site, is what stops that recurring.
 *
 * Administrative surfaces and the developer sandbox pass
 * `{ includeUnpublished: true }`.
 */
export type CurriculumVisibility = { includeUnpublished?: boolean };

const PUBLISHED = "published" as const;

export async function getLevelByLanguageAndNumber(
  db: DbClient,
  languageId: string,
  levelNumber: number,
  { includeUnpublished = false }: CurriculumVisibility = {},
): Promise<CurriculumLevel | null> {
  const [row] = await db
    .select()
    .from(levels)
    .where(
      and(
        eq(levels.languageId, languageId),
        eq(levels.levelNumber, levelNumber),
        includeUnpublished ? undefined : eq(levels.status, PUBLISHED),
      ),
    )
    .limit(1);
  return row ? toCurriculumLevel(row) : null;
}

export async function getVocabularyGroup(db: DbClient, id: string): Promise<CurriculumVocabularyGroup | null> {
  const [row] = await db.select().from(vocabularyGroups).where(eq(vocabularyGroups.id, id)).limit(1);
  return row ? toCurriculumVocabularyGroup(row) : null;
}

/** Every vocabulary group in one language, ordered by level then position (spec 11 §10's Group filter dropdown). */
export async function getVocabularyGroupsByLanguage(db: DbClient, languageId: string): Promise<CurriculumVocabularyGroup[]> {
  const rows = await db
    .select()
    .from(vocabularyGroups)
    .where(eq(vocabularyGroups.languageId, languageId))
    .orderBy(asc(vocabularyGroups.levelId), asc(vocabularyGroups.position));
  return rows.map(toCurriculumVocabularyGroup);
}

export async function getLearningItem(db: DbClient, id: string): Promise<CurriculumLearningItem | null> {
  const [item] = await db.select().from(learningItems).where(eq(learningItems.id, id)).limit(1);
  return item ? attachDetail(db, item) : null;
}

/**
 * Batched, not per-item (architecture.md's "N+1 query patterns are
 * prohibited") — a level can hold dozens of items (spec 10 §11: ~12 grammar
 * + ~48 vocabulary), and unlike when this function was first written (spec
 * 08, "no real consumer yet"), spec 10's level page is exactly the
 * performance-sensitive real consumer that rule anticipates. One query for
 * the ordered id list, then `getLearningItemsByIds`'s existing bounded
 * batch-detail fetch — a small id round-trip, but still ~4 queries total
 * regardless of level size rather than one per item.
 */
export async function getLevelItems(
  db: DbClient,
  levelId: string,
  { includeUnpublished = false }: CurriculumVisibility = {},
): Promise<CurriculumLearningItem[]> {
  const rows = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .where(and(eq(learningItems.levelId, levelId), includeUnpublished ? undefined : eq(learningItems.status, PUBLISHED)))
    .orderBy(asc(learningItems.position));
  return getLearningItemsByIds(db, rows.map((row) => row.id));
}

/**
 * Batch fetch by id, in a bounded number of queries regardless of how many
 * ids are requested — 1 for the shared identity rows, plus at most 1 each
 * for vocabulary/grammar detail (never one query per item, unlike
 * `attachDetail`'s per-item `getLearningItem` path). Built for spec 09's
 * review-session loading, where a due-review queue can span many items and
 * §20's "database queries/request < 10" target matters. Order matches the
 * input `ids`, silently dropping any id that no longer resolves — callers
 * that need to detect a missing id compare lengths themselves.
 */
export async function getLearningItemsByIds(db: DbClient, ids: string[]): Promise<CurriculumLearningItem[]> {
  if (ids.length === 0) return [];

  const items = await db.select().from(learningItems).where(inArray(learningItems.id, ids));
  const vocabularyItemIds = items.filter((item) => item.type === "vocabulary").map((item) => item.id);
  const grammarItemIds = items.filter((item) => item.type === "grammar").map((item) => item.id);

  const [vocabularyDetails, grammarDetails] = await Promise.all([
    vocabularyItemIds.length > 0
      ? db.select().from(vocabularyItems).where(inArray(vocabularyItems.learningItemId, vocabularyItemIds))
      : Promise.resolve([]),
    grammarItemIds.length > 0
      ? db.select().from(grammarItems).where(inArray(grammarItems.learningItemId, grammarItemIds))
      : Promise.resolve([]),
  ]);

  const vocabularyById = new Map(vocabularyDetails.map((detail) => [detail.learningItemId, detail]));
  const grammarById = new Map(grammarDetails.map((detail) => [detail.learningItemId, detail]));
  const itemById = new Map(items.map((item) => [item.id, item]));

  const results: CurriculumLearningItem[] = [];
  for (const id of ids) {
    const item = itemById.get(id);
    if (!item) continue;

    const base = {
      id: item.id,
      languageId: item.languageId,
      levelId: item.levelId,
      status: item.status,
      position: item.position,
      lessonPriority: item.lessonPriority,
      version: item.version,
    };

    if (item.type === "vocabulary") {
      const detail = vocabularyById.get(item.id);
      if (!detail) {
        throw new Error(`Data integrity error: learning item ${item.id} is type "vocabulary" with no vocabulary_items row.`);
      }
      results.push({ ...base, type: "vocabulary", vocabulary: toCurriculumVocabularyDetail(detail) });
    } else {
      const detail = grammarById.get(item.id);
      if (!detail) {
        throw new Error(`Data integrity error: learning item ${item.id} is type "grammar" with no grammar_items row.`);
      }
      results.push({ ...base, type: "grammar", grammar: toCurriculumGrammarDetail(detail) });
    }
  }

  return results;
}

/**
 * Example sentences for one learning item, published only. `learning_item_sentences`
 * links generically to `learning_items` (not vocabulary-specific — confirmed by
 * `lesson-curriculum-repository.ts` already attaching examples to grammar items
 * for the real lesson flow), so this covers both types. Mirrors the query shape
 * `domains/lexicon/lexicon-read-model.ts` already uses for a vocabulary item's
 * own examples; not shared code, since the two live in different domains, but
 * kept deliberately identical in shape.
 */
export async function getLearningItemExamples(db: DbClient, learningItemId: string): Promise<CurriculumExampleSentence[]> {
  return db
    .select({ targetText: sentences.targetText, translation: sentences.translation })
    .from(learningItemSentences)
    .innerJoin(sentences, eq(sentences.id, learningItemSentences.sentenceId))
    .where(and(eq(learningItemSentences.learningItemId, learningItemId), eq(sentences.status, "published")))
    .orderBy(asc(learningItemSentences.position));
}

// --- Spec 18: grammar About blocks, resources, and hero navigation ---

/**
 * A grammar item's About blocks in authored order.
 *
 * The row-to-union mapping asserts what `grammar_content_blocks`' check
 * constraint already guarantees, and throws rather than silently dropping a
 * malformed block: a block that violates the constraint cannot exist, so
 * reaching this branch means the constraint was bypassed, which is a data
 * integrity error worth surfacing — not a block to quietly hide from a
 * learner.
 */
export async function getGrammarContentBlocks(db: DbClient, learningItemId: string): Promise<CurriculumGrammarContentBlock[]> {
  const rows = await db
    .select()
    .from(grammarContentBlocks)
    .where(eq(grammarContentBlocks.learningItemId, learningItemId))
    .orderBy(asc(grammarContentBlocks.position));

  return rows.map((row) => {
    if (row.type === "example") {
      if (row.targetText === null || row.translation === null) {
        throw new Error(`Data integrity error: grammar content block ${row.id} is type "example" with no target text or translation.`);
      }
      return { id: row.id, position: row.position, type: "example", targetText: row.targetText, translation: row.translation };
    }
    if (row.body === null) {
      throw new Error(`Data integrity error: grammar content block ${row.id} is type "${row.type}" with no body.`);
    }
    return { id: row.id, position: row.position, type: row.type, body: row.body };
  });
}

/** An item's admin-authored external resources in display order. */
export async function getItemResources(db: DbClient, learningItemId: string): Promise<CurriculumItemResource[]> {
  return db
    .select({
      id: learningItemResources.id,
      label: learningItemResources.label,
      url: learningItemResources.url,
      position: learningItemResources.position,
    })
    .from(learningItemResources)
    .where(eq(learningItemResources.learningItemId, learningItemId))
    .orderBy(asc(learningItemResources.position));
}

/**
 * The ordered item ids the item page's hero arrows cycle through (spec 18).
 *
 * Grammar cycles through every grammar item in the level; vocabulary cycles
 * through its own theme (vocabulary group). Returns ids only — the hero
 * needs a position, a count, and two link targets, not sixty detail rows, so
 * loading the siblings' content would be pure waste on every item page.
 *
 * Published-only by the same default the rest of this module uses: an
 * archived or pending sibling must not appear in a learner's navigation.
 */
export async function getSiblingItemIds(
  db: DbClient,
  item: { id: string; type: "vocabulary" | "grammar"; levelId: string },
  vocabularyGroupId: string | null,
): Promise<string[]> {
  if (item.type === "grammar") {
    const rows = await db
      .select({ id: learningItems.id })
      .from(learningItems)
      .where(and(eq(learningItems.levelId, item.levelId), eq(learningItems.type, "grammar"), eq(learningItems.status, PUBLISHED)))
      .orderBy(asc(learningItems.position));
    return rows.map((row) => row.id);
  }

  if (!vocabularyGroupId) return [];

  const rows = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .innerJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
    .where(and(eq(vocabularyItems.vocabularyGroupId, vocabularyGroupId), eq(learningItems.status, PUBLISHED)))
    .orderBy(asc(learningItems.position));
  return rows.map((row) => row.id);
}
