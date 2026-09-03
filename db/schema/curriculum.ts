import { sql } from "drizzle-orm";
import { foreignKey, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { languages } from "./languages";

/** Spec 08 §8 — Curriculum Item Status. */
export const curriculumStatusEnum = pgEnum("curriculum_status", ["draft", "published", "archived"]);

/** Spec 08 §8 — Learning Item Type. v1 supports vocabulary/grammar; the shared identity design must stay compatible with future types (kanji, radicals) without a redesign. */
export const learningItemTypeEnum = pgEnum("learning_item_type", ["vocabulary", "grammar"]);

/**
 * Curriculum levels (spec 08 §14). Level numbers are scoped to language, not
 * global — `(language_id, level_number)` is unique. `(id, language_id)` is
 * also unique so §22's composite foreign keys can reference it, making a
 * cross-language relationship unrepresentable rather than merely discouraged.
 */
export const levels = pgTable(
  "levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    levelNumber: integer("level_number").notNull(),
    name: text("name"),
    status: curriculumStatusEnum("status").notNull().default("draft"),
    ...timestamps(),
  },
  (t) => [
    unique("levels_language_id_level_number_key").on(t.languageId, t.levelNumber),
    unique("levels_id_language_id_key").on(t.id, t.languageId),
  ],
);

/**
 * Vocabulary groups/themes (spec 08 §15). Position is explicit and scoped to
 * the containing level — insertion order is never curriculum order. The
 * "4 groups of 12" target is a curriculum *validation* rule, not a schema
 * limit; nothing here caps the group count.
 */
export const vocabularyGroups = pgTable(
  "vocabulary_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    levelId: uuid("level_id").notNull(),
    languageId: uuid("language_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: curriculumStatusEnum("status").notNull().default("draft"),
    ...timestamps(),
  },
  (t) => [
    unique("vocabulary_groups_level_id_position_key").on(t.levelId, t.position),
    unique("vocabulary_groups_id_language_id_key").on(t.id, t.languageId),
    foreignKey({
      name: "vocabulary_groups_level_language_fk",
      columns: [t.levelId, t.languageId],
      foreignColumns: [levels.id, levels.languageId],
    }).onDelete("restrict"),
  ],
);

/**
 * The shared learning-item identity (spec 08 §16, architecture.md's
 * "Shared Learning Identity"). This row is the *permanent* identity of the
 * learning item — vocabulary/grammar/progress/lessons/notes/synonyms all
 * reference `learning_items.id`, never a type-specific table's own key.
 * Editing content or moving an item between levels/groups must never
 * generate a replacement ID.
 */
export const learningItems = pgTable(
  "learning_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    levelId: uuid("level_id").notNull(),
    type: learningItemTypeEnum("type").notNull(),
    status: curriculumStatusEnum("status").notNull().default("draft"),
    position: integer("position").notNull(),
    lessonPriority: integer("lesson_priority").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("learning_items_id_language_id_key").on(t.id, t.languageId),
    // Spec 08 §17: duplicate positions of the same item type within the same level must not silently occur.
    unique("learning_items_level_type_position_key").on(t.levelId, t.type, t.position),
    foreignKey({
      name: "learning_items_level_language_fk",
      columns: [t.levelId, t.languageId],
      foreignColumns: [levels.id, levels.languageId],
    }).onDelete("restrict"),
  ],
);

/**
 * Vocabulary-specific fields (spec 08 §18), one-to-one with `learning_items`
 * via a shared primary key. Never stores learner-specific state (SRS stage,
 * notes, synonyms) — that lives in the progress/learner-content tables.
 */
export const vocabularyItems = pgTable("vocabulary_items", {
  learningItemId: uuid("learning_item_id")
    .primaryKey()
    .references(() => learningItems.id, { onDelete: "restrict" }),
  vocabularyGroupId: uuid("vocabulary_group_id")
    .notNull()
    .references(() => vocabularyGroups.id, { onDelete: "restrict" }),
  term: text("term").notNull(),
  primaryMeaning: text("primary_meaning").notNull(),
  definition: text("definition"),
  article: text("article"),
  partOfSpeech: text("part_of_speech").notNull(),
  pronunciation: text("pronunciation"),
  ipa: text("ipa"),
  context: text("context"),
  creatorNotes: text("creator_notes"),
  ...timestamps(),
});

/**
 * Direction/format of one required grammar review question (spec 09 §7).
 * Mirrors `domains/curriculum/curriculum-types.ts`'s fixture-domain shape
 * exactly (`GrammarItem.requiredQuestions`) rather than inventing a new one.
 * "translation" is the only format implemented anywhere in this codebase
 * today (spec 09's review UI doesn't build anything else, e.g. word banks) —
 * the JSONB shape leaves room to add a format without another migration.
 */
export type GrammarQuestionDirection = "targetToEnglish" | "englishToTarget";
export type GrammarQuestionFormat = "translation";
export type GrammarQuestionRequirement = { format: GrammarQuestionFormat; direction: GrammarQuestionDirection };

/** The one currently-real default: every grammar item seeded before this column existed only ever required a single targetToEnglish translation question. */
const DEFAULT_REQUIRED_QUESTIONS: GrammarQuestionRequirement[] = [{ format: "translation", direction: "targetToEnglish" }];

/**
 * Grammar-specific fields (spec 08 §19), one-to-one with `learning_items`.
 * `structure` is the short display label (e.g. "y") matching spec 07's
 * `GrammarItem.structure`; `title` is an optional longer descriptive name.
 *
 * `requiredQuestions` (spec 09 §7, added in spec 09 unit 3): the configured
 * review question requirements for this grammar concept. `NOT NULL` with a
 * database-level default matching every real grammar row's current actual
 * behavior, so the migration adding this column backfills existing rows
 * safely in one statement rather than needing a separate expand/contract
 * pass — every future insert should still set it explicitly.
 */
export const grammarItems = pgTable("grammar_items", {
  learningItemId: uuid("learning_item_id")
    .primaryKey()
    .references(() => learningItems.id, { onDelete: "restrict" }),
  title: text("title"),
  structure: text("structure").notNull(),
  primaryMeaning: text("primary_meaning").notNull(),
  explanation: text("explanation").notNull(),
  category: text("category"),
  creatorNotes: text("creator_notes"),
  requiredQuestions: jsonb("required_questions")
    .$type<GrammarQuestionRequirement[]>()
    .notNull()
    // `sql.raw` (not `sql` with a template param) — drizzle-kit can't emit a
    // migration DEFAULT clause with a bound parameter, only a SQL literal.
    // Safe here: the JSON is fixed, known content, not external input.
    .default(sql.raw(`'${JSON.stringify(DEFAULT_REQUIRED_QUESTIONS)}'::jsonb`)),
  ...timestamps(),
});

/**
 * Reusable official example sentences (spec 08 §20). Sentences are
 * supporting curriculum content — they never get their own SRS stage.
 */
export const sentences = pgTable("sentences", {
  id: uuid("id").primaryKey().defaultRandom(),
  languageId: uuid("language_id")
    .notNull()
    .references(() => languages.id, { onDelete: "restrict" }),
  targetText: text("target_text").notNull(),
  translation: text("translation").notNull(),
  status: curriculumStatusEnum("status").notNull().default("draft"),
  ...timestamps(),
});

/** Join table relating a learning item to its supporting example sentences, with explicit display ordering. */
export const learningItemSentences = pgTable(
  "learning_item_sentences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "restrict" }),
    sentenceId: uuid("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [unique("learning_item_sentences_item_position_key").on(t.learningItemId, t.position)],
);
