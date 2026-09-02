import { asc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { grammarItems, languages, learningItems, levels, vocabularyGroups, vocabularyItems } from "@/db/schema";

import type {
  CurriculumGrammarDetail,
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
  return { id: row.id, languageId: row.languageId, levelNumber: row.levelNumber, name: row.name, status: row.status };
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

export async function getLevelById(db: DbClient, levelId: string): Promise<CurriculumLevel | null> {
  const [row] = await db.select().from(levels).where(eq(levels.id, levelId)).limit(1);
  return row ? toCurriculumLevel(row) : null;
}

export async function getLevelsByLanguage(db: DbClient, languageId: string): Promise<CurriculumLevel[]> {
  const rows = await db.select().from(levels).where(eq(levels.languageId, languageId)).orderBy(asc(levels.levelNumber));
  return rows.map(toCurriculumLevel);
}

export async function getVocabularyGroup(db: DbClient, id: string): Promise<CurriculumVocabularyGroup | null> {
  const [row] = await db.select().from(vocabularyGroups).where(eq(vocabularyGroups.id, id)).limit(1);
  return row ? toCurriculumVocabularyGroup(row) : null;
}

export async function getLearningItem(db: DbClient, id: string): Promise<CurriculumLearningItem | null> {
  const [item] = await db.select().from(learningItems).where(eq(learningItems.id, id)).limit(1);
  return item ? attachDetail(db, item) : null;
}

export async function getLevelItems(db: DbClient, levelId: string): Promise<CurriculumLearningItem[]> {
  const items = await db
    .select()
    .from(learningItems)
    .where(eq(learningItems.levelId, levelId))
    .orderBy(asc(learningItems.position));
  return Promise.all(items.map((item) => attachDetail(db, item)));
}
