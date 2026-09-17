import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { languages } from "./languages";
import { users } from "./users";

/**
 * Spec 08 §8 — Curriculum Item Status. `pending` added spec 11 Unit 3
 * (2026-09-05) — every newly created curriculum item enters this status
 * directly (spec 11 §15, confirmed same day) rather than `draft`; `draft`
 * is reserved for an in-progress edit to an already-published item (spec 11
 * §27/§28). Ordered `draft, pending, published, archived` deliberately —
 * Postgres sorts an enum column by declaration order, not alphabetically,
 * so `ORDER BY status` gives a sensible workflow progression for free.
 */
export const curriculumStatusEnum = pgEnum("curriculum_status", [
  "draft",
  "pending",
  "published",
  "archived",
]);

/** Spec 08 §8 — Learning Item Type. v1 supports vocabulary/grammar; the shared identity design must stay compatible with future types (kanji, radicals) without a redesign. */
export const learningItemTypeEnum = pgEnum("learning_item_type", [
  "vocabulary",
  "grammar",
]);

/**
 * Spec 20 General — NSFW Content. A property of the content itself, not of
 * any one learner's preference (that lives on `user_preferences`). Defaults
 * `safe` on every existing and new row — nothing in the current curriculum
 * needs classifying as `nsfw` yet, and no Admin authoring UI to set it
 * exists (a deliberate scope decision, recorded in progress-tracker.md);
 * this is the plumbing the learner-facing preference and its filtering
 * checks against, ready for whenever that authoring UI does exist.
 */
export const contentClassificationEnum = pgEnum("content_classification", [
  "safe",
  "nsfw",
]);

/**
 * Spec 11 (rewrite) — Accepted-Answer Side. Same two values and meaning as
 * `learner-content.ts`'s `synonym_side` (a synonym/answer accepted for
 * `gato → cat` isn't necessarily acceptable for `cat → gato`), but declared
 * separately rather than imported — `learner-content.ts` already imports
 * `learningItems` from this file, so importing the other way would create a
 * circular module dependency.
 */
export const answerSideEnum = pgEnum("answer_side", ["term", "meaning"]);

/**
 * CEFR band a curriculum level corresponds to (spec 18's `A1 - Level 1 - 1/13`
 * hero line). Nullable and admin-set: nothing in the curriculum derives a
 * band from the level number, and inventing a mapping ("levels 1-5 are A1")
 * would be a curriculum progression decision nobody has made. A level with
 * no band set simply renders `Level 1 - 1/13`.
 */
export const cefrLevelEnum = pgEnum("cefr_level", [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
]);
export type CefrLevel = (typeof cefrLevelEnum.enumValues)[number];

/**
 * How formal/marked a learning item is (spec 18's Details summary card).
 * A configured enum rather than free text, per spec 18's "prefer
 * enums/configured types for values such as Register" — the same value has
 * to read identically on every item page and be filterable later.
 *
 * Nullable on both item tables: register is genuinely unknown for every
 * item authored before this column existed, and "unknown" must not silently
 * render as "neutral" — a learner reading `neutral` on a word nobody
 * classified would be told something false.
 *
 * Deliberately excludes a "regional" value: where a word is used is already
 * modelled, with evidence, by `domains/lexicon`'s regional evidence, and a
 * second, weaker answer to the same question would be worse than none.
 */
export const registerEnum = pgEnum("register", [
  "neutral",
  "formal",
  "informal",
  "colloquial",
  "slang",
  "vulgar",
  "literary",
]);
export type Register = (typeof registerEnum.enumValues)[number];

/**
 * Ordered block types inside a grammar item's About content (spec 18).
 * Exactly three, deliberately: `text` is ordinary explanation, `example` is
 * an outlined target-sentence/translation pair, and `note` is a highlighted
 * Polyglot aside. Spec 18's scope limits rule out a generic rich-text or
 * page-builder system, so this stays a closed set rather than an open
 * block registry.
 */
export const grammarContentBlockTypeEnum = pgEnum(
  "grammar_content_block_type",
  ["text", "example", "note"],
);
export type GrammarContentBlockType =
  (typeof grammarContentBlockTypeEnum.enumValues)[number];

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
    /**
     * Per-level curriculum targets (2026-09-07). Spec 11's "48 vocabulary /
     * 4 groups / 12 grammar" is explicitly "validation rules, not hardcoded
     * schema assumptions", and architecture.md requires the database support
     * a different curriculum shape without a redesign — but the numbers were
     * still a single global constant, so a deliberately smaller level (an
     * introductory Level 1, a short bridging level, a language with a
     * different shape) simply could not be published.
     *
     * `NULL` means "use the configured default", so existing levels keep
     * behaving exactly as before and no backfill is needed. `0` means "no
     * requirement" — that is the escape hatch for a level that genuinely has
     * no grammar, and it is a configured decision rather than a bypass of
     * the publish gate, which still applies.
     */
    vocabularyItemTarget: integer("vocabulary_item_target"),
    vocabularyGroupTarget: integer("vocabulary_group_target"),
    grammarItemTarget: integer("grammar_item_target"),
    /** The CEFR band shown in an item page's hero line (spec 18). `NULL` until an admin sets it — see `cefrLevelEnum`. */
    cefrLevel: cefrLevelEnum("cefr_level"),
    ...timestamps(),
  },
  (t) => [
    unique("levels_language_id_level_number_key").on(
      t.languageId,
      t.levelNumber,
    ),
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
    // Default "pending", not "draft" (spec 11 §15, confirmed 2026-09-05) —
    // every newly created learning item is staged for its first-ever
    // publish; "draft" only applies to an in-progress edit of an
    // already-published item (spec 11 §27/§28), which always sets status
    // explicitly rather than relying on this default.
    status: curriculumStatusEnum("status").notNull().default("pending"),
    // Spec 20 General — NSFW Content. See `contentClassificationEnum`.
    contentClassification: contentClassificationEnum("content_classification")
      .notNull()
      .default("safe"),
    position: integer("position").notNull(),
    lessonPriority: integer("lesson_priority").notNull(),
    // Spec 11 (rewrite) — optimistic-concurrency version, bumped on every
    // publish. Implements the spec's literal `ADMIN_EDIT_CONFLICT` example:
    // Admin A loads version 5, Admin B publishes to 6, Admin A's save
    // against stale version 5 is rejected. Independent of `updated_at`,
    // which also changes on non-publish writes (e.g. `$onUpdate`).
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    unique("learning_items_id_language_id_key").on(t.id, t.languageId),
    // Spec 08 §17: duplicate positions of the same item type within the same level must not silently occur.
    unique("learning_items_level_type_position_key").on(
      t.levelId,
      t.type,
      t.position,
    ),
    foreignKey({
      name: "learning_items_level_language_fk",
      columns: [t.levelId, t.languageId],
      foreignColumns: [levels.id, levels.languageId],
    }).onDelete("restrict"),
    // Spec 11 §10/§13 — Admin curriculum listing: filter by status (almost
    // always combined with a language scope) and sort by recency.
    index("learning_items_language_status_updated_idx").on(
      t.languageId,
      t.status,
      t.updatedAt.desc(),
    ),
  ],
);

/**
 * The vocabulary fields a confirmed dictionary match supplies, and therefore
 * the only fields an author can "take over" from the dictionary (spec 17).
 *
 * `term` and `primary_meaning` are deliberately absent: the term is the
 * item's identity and the primary meaning is the answer a learner is graded
 * against, so neither is ever dictionary-supplied in the first place.
 */
export const DICTIONARY_OVERRIDABLE_FIELDS = [
  "definition",
  "partOfSpeech",
  "ipa",
] as const;
export type DictionaryOverridableField =
  (typeof DICTIONARY_OVERRIDABLE_FIELDS)[number];

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
  /** Spec 18's Details summary card. `NULL` means nobody has classified this word — rendered as an em dash, never as "neutral". */
  register: registerEnum("register"),
  /**
   * Which dictionary-supplied fields an author has taken over (spec 17).
   *
   * Confirming a dictionary match writes `definition`, `part_of_speech` and
   * `ipa` into this row. Once someone edits one of those by hand, the
   * dictionary must stop overwriting it — through re-confirmation, a sense
   * change, a dictionary re-import, or a curriculum re-import — until they
   * explicitly reset it.
   *
   * A list of field names rather than one boolean per field: the set of
   * promotable fields is defined in code
   * (`DICTIONARY_OVERRIDABLE_FIELDS`), and growing it should not cost a
   * migration. Marks are per field on purpose — editing the teaching
   * meaning must not freeze the IPA.
   */
  dictionaryFieldOverrides: text("dictionary_field_overrides")
    .array()
    .$type<DictionaryOverridableField[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
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
export type GrammarQuestionRequirement = {
  format: GrammarQuestionFormat;
  direction: GrammarQuestionDirection;
};

/** The one currently-real default: every grammar item seeded before this column existed only ever required a single targetToEnglish translation question. */
const DEFAULT_REQUIRED_QUESTIONS: GrammarQuestionRequirement[] = [
  { format: "translation", direction: "targetToEnglish" },
];

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
  /** Spec 18's Details summary card — the same enum vocabulary uses, since register is a property of the item, not of its type. */
  register: registerEnum("register"),
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
  // Spec 20 General — NSFW Content. See `contentClassificationEnum`.
  contentClassification: contentClassificationEnum("content_classification")
    .notNull()
    .default("safe"),
  ...timestamps(),
});

/**
 * One way a word is actually used, and the tab a learner sees its examples
 * under (spec 17) — `comer` gets `como`, `comes`, `come`.
 *
 * Display grouping only: a usage context is never a learning item, has no
 * SRS stage, and no progress is tracked against it. That is why this
 * cascades on delete where the rest of the curriculum restricts — a context
 * has no independent existence and nothing outside the item can reference
 * it, so deleting the word should take its tabs with it.
 *
 * Named for vocabulary because that is what spec 17 built it for, and the
 * table name is kept rather than renamed (a rename is a destructive
 * migration for a cosmetic gain). Spec 18 widened it to grammar as well —
 * its "Pattern of Use" tabs are this exact concept, and the table has always
 * keyed on `learning_item_id` rather than on a vocabulary row, so a grammar
 * item's patterns need no new table and no second authoring surface. A
 * grammar pattern is authored by hand; only vocabulary can seed one from a
 * dictionary form.
 */
export const vocabularyUsageContexts = pgTable(
  "vocabulary_usage_contexts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    /** What the tab reads, e.g. "como" — seeded from a dictionary form, then freely renameable. */
    label: text("label").notNull(),
    /** Optional guidance shown with the tab, e.g. "first-person singular present". */
    note: text("note"),
    position: integer("position").notNull(),
    /**
     * The dictionary form this context was seeded from, or `NULL` when it was
     * authored by hand. Kept so re-seeding can tell "the dictionary already
     * gave you this one" from "somebody wrote this", and so renaming a
     * seeded tab does not make it look hand-made.
     */
    sourceForm: text("source_form"),
    ...timestamps(),
  },
  (t) => [
    unique("vocabulary_usage_contexts_item_position_key").on(
      t.learningItemId,
      t.position,
    ),
    index("vocabulary_usage_contexts_item_idx").on(t.learningItemId),
  ],
);

/**
 * Join table relating a learning item to its supporting example sentences,
 * with explicit display ordering.
 *
 * `usage_context_id` (spec 17) is which tab the example belongs to. `NULL`
 * means the **General** tab, which is what every example authored before
 * usage contexts existed already is — so nothing needed migrating, and an
 * example never becomes unreachable. Deleting a context sets this back to
 * `NULL` rather than deleting the example: losing a tab should not silently
 * lose the sentences somebody wrote in it.
 *
 * `position` stays unique per *item*, not per context, so an example keeps
 * one unambiguous place in the word's ordering however the tabs are
 * arranged; a tab renders its own examples in that same order.
 */
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
    usageContextId: uuid("usage_context_id").references(
      () => vocabularyUsageContexts.id,
      { onDelete: "set null" },
    ),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("learning_item_sentences_item_position_key").on(
      t.learningItemId,
      t.position,
    ),
    index("learning_item_sentences_usage_context_idx").on(t.usageContextId),
  ],
);

/**
 * Official, admin-authored accepted answers (spec 11 rewrite's "Accepted
 * Vocabulary Answers"/grammar "accepted answers" fields) — distinct from
 * `user_synonyms` (private, learner-created). Applies uniformly to
 * vocabulary and grammar items via the same `side` distinction
 * `user_synonyms` already uses, so `domains/srs`'s
 * `getReviewQuestionAnswerSpec` can merge official and user-submitted
 * answers by side without a type-specific special case — this table is
 * exactly the extension point that function's own docstring anticipated
 * ("will pick up official variations for free... whenever that
 * curriculum-authoring capability is added").
 */
export const acceptedAnswers = pgTable(
  "accepted_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "restrict" }),
    side: answerSideEnum("side").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("accepted_answers_item_side_normalized_key").on(
      t.learningItemId,
      t.side,
      t.normalizedValue,
    ),
    index("accepted_answers_learning_item_idx").on(t.learningItemId),
  ],
);

/**
 * An in-progress, unpublished edit to an already-published curriculum item
 * (spec 11 rewrite's "Published Revision Model"/"Curriculum Status Model"
 * §Draft). The live `learning_items`/`vocabulary_items`/`grammar_items` rows
 * stay untouched while a draft exists — the admin UI reads/writes this row
 * instead. `data` is a full snapshot of the editable vocabulary/grammar
 * fields (plus pending accepted-answer values), shaped like
 * `domains/curriculum`'s `CurriculumVocabularyDetail`/`CurriculumGrammarDetail`
 * plus an `acceptedAnswers` field — deliberately not mirrored into a second
 * permanent, fully-typed table, since this row is disposable staging state
 * consumed and deleted the moment Publish applies it.
 *
 * Brand-new items never get a row here at all: they have no live version to
 * protect, so they're created directly in `learning_items` at `pending`
 * status and edited in place until their first Publish just flips the
 * status (see `learning_items.status`'s own default-value comment).
 *
 * At most one open draft per item — enforced by the unique constraint on
 * `learning_item_id`, not merely a UI convention.
 */
export const curriculumItemDrafts = pgTable(
  "curriculum_item_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .unique()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    // The `learning_items.version` this draft was opened against — the
    // optimistic-concurrency check at Publish time compares this to the
    // item's *current* version, not just the draft row's own timestamps.
    baseVersion: integer("base_version").notNull(),
    data: jsonb("data").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("curriculum_item_drafts_created_by_idx").on(t.createdBy)],
);

/**
 * The ordered blocks making up a grammar item's About content (spec 18).
 *
 * Three closed types (`grammarContentBlockTypeEnum`), not a rich-text
 * document: spec 18's scope limits rule out a generic page builder, and a
 * closed set is what lets the same three blocks render identically in the
 * item page, the lesson, and the admin editor.
 *
 * `body` carries `text` and `note` content; `target_text`/`translation`
 * carry an `example`. A check constraint enforces that shape at the
 * database level so a half-filled block cannot exist even if a future
 * caller skips validation.
 *
 * Cascades on delete, like `vocabulary_usage_contexts` and unlike the rest
 * of the curriculum, for the same reason: a block has no independent
 * existence, nothing outside its item can reference it, and deleting the
 * grammar point should take its explanation with it.
 */
export const grammarContentBlocks = pgTable(
  "grammar_content_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    type: grammarContentBlockTypeEnum("type").notNull(),
    position: integer("position").notNull(),
    /** `text`/`note` content. `NULL` for an `example` block. */
    body: text("body"),
    /** `example` blocks only — the target-language sentence. */
    targetText: text("target_text"),
    /** `example` blocks only — its English translation. */
    translation: text("translation"),
    ...timestamps(),
  },
  (t) => [
    unique("grammar_content_blocks_item_position_key").on(
      t.learningItemId,
      t.position,
    ),
    index("grammar_content_blocks_item_idx").on(t.learningItemId),
    check(
      "grammar_content_blocks_shape_check",
      sql`(
        (${t.type} in ('text', 'note') and ${t.body} is not null and ${t.targetText} is null and ${t.translation} is null)
        or (${t.type} = 'example' and ${t.body} is null and ${t.targetText} is not null and ${t.translation} is not null)
      )`,
    ),
  ],
);

/**
 * Admin-authored external learning resources for one item (spec 18's
 * Resources section) — the first time this codebase has stored them; the
 * fixture curriculum's `resources` array had no table behind it.
 *
 * Official content only. Learner-private notes, synonyms, and examples live
 * in `learner-content.ts` and are never mixed into this list (spec 18: "do
 * not mix user-private content with official resource links").
 *
 * Cascades on delete for the same reason grammar content blocks do.
 */
export const learningItemResources = pgTable(
  "learning_item_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("learning_item_resources_item_position_key").on(
      t.learningItemId,
      t.position,
    ),
    index("learning_item_resources_item_idx").on(t.learningItemId),
  ],
);
