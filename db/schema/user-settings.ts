import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { vocabularyGroups } from "./curriculum";
import { languages } from "./languages";
import { users } from "./users";

/**
 * How new curriculum is introduced to a learner. Originally spec 16's
 * `theme`/`random`/`balanced`; spec 20 ("Learning Queue") renamed and
 * consolidated the learner-facing system to three different modes without
 * abandoning existing stored preferences:
 *
 * - `theme` → **`default_order`** is new, not a rename: the authored
 *   curriculum sequence (grammar first, then each vocabulary group in
 *   order) — no old mode behaved this way.
 * - `choose_group` — the renamed `theme` (work through one chosen
 *   vocabulary group at a time); behavior is unchanged.
 * - `variety` — both old `balanced` *and* old `random` migrate here (spec
 *   20's explicit mapping). This is a real, spec-mandated behavior change
 *   for anyone previously in `random`: `variety` behaves like old
 *   `balanced` (round-robin vocabulary across groups, grammar reserved
 *   separately) plus the new Grammar Placement setting — old `random`'s
 *   "mix vocabulary and grammar with no reservation at all" behavior no
 *   longer exists as an option.
 *
 * The old three values are **expanded, not replaced** — Postgres enum
 * values are only ever added here, and the migration that added
 * `default_order`/`choose_group`/`variety` a data-only follow-up migration
 * that backfilled every existing row from old to new (see that migration's
 * comment for why it's a separate file). `theme`/`random`/`balanced` are
 * never written by application code again after that backfill —
 * `domains/users/curriculum-preference.ts`'s `CurriculumMode` union only
 * ever includes the three new values — but the labels stay in the SQL enum
 * type itself: removing a Postgres enum value safely requires recreating
 * the whole type, which is a bigger, riskier operation than leaving three
 * permanently-unused labels behind. Recorded as a known, deliberate
 * deviation from "the old values should not remain as a second hidden
 * behavior system," read at the application-code level (satisfied) rather
 * than the SQL-type level (not attempted) — see progress-tracker.md.
 */
export const curriculumModeEnum = pgEnum("curriculum_mode", [
  "theme",
  "random",
  "balanced",
  "default_order",
  "choose_group",
  "variety",
]);

/**
 * Spec 20 Lessons — Grammar Placement. Meaningful only in `variety` mode
 * (`default_order` always teaches grammar first; `choose_group` follows
 * the grammar curriculum's own authored order regardless) — enforced in
 * `domains/lessons/lesson-batch.ts`, not by a database constraint, since
 * every mode still needs *some* stored value even when it ignores it.
 */
export const grammarPlacementEnum = pgEnum("grammar_placement", ["first", "last", "no_preference"]);

/**
 * Per-learner, per-language settings (spec 16: "Store the selected mode on
 * the learner's language-specific settings/profile"). Language-scoped rather
 * than a column on `users`, because a learner studying two languages is
 * making two independent curriculum decisions — and because
 * `selected_vocabulary_group_id` points at a group that belongs to exactly
 * one language's curriculum.
 *
 * **The absence of a row is meaningful**: it means this learner has not yet
 * chosen for this language, which is what routes them onto the curriculum
 * preference screen after onboarding. `curriculum_mode` is therefore
 * `NOT NULL` with no default — there is no "row exists but undecided" state,
 * the same shape `user_item_progress` uses for enrollment.
 *
 * The selected theme is only meaningful in `theme` mode, and the check
 * constraint enforces that rather than leaving a stale, invisible selection
 * behind when a learner switches away. Switching modes writes only this row:
 * learned items, SRS stages, review schedules, and level unlocks are
 * untouched by construction, since nothing here can reach those tables.
 */
export const userLanguageSettings = pgTable(
  "user_language_settings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    curriculumMode: curriculumModeEnum("curriculum_mode").notNull(),
    /**
     * The vocabulary group Theme mode is currently working through, or
     * `NULL` when the learner has not picked one yet (or has finished the
     * last one). Its foreign key is the composite one below rather than a
     * plain column reference — that single constraint both points at a real
     * group and forces it to be one of *this language's* groups, so a
     * second, weaker key would be pure redundancy. `restrict`, not
     * `cascade`: a group a learner has selected should be archived rather
     * than deleted, like every other curriculum reference in this schema.
     */
    selectedVocabularyGroupId: uuid("selected_vocabulary_group_id"),
    /**
     * Spec 20 Lessons — Grammar Placement. `no_preference` default matches
     * the spec's stated default exactly. Every mode stores a value even
     * though only `variety` reads it — there is no "row exists but this
     * field is undecided" state here, unlike `curriculum_mode` itself.
     */
    grammarPlacement: grammarPlacementEnum("grammar_placement").notNull().default("no_preference"),
    /**
     * Spec 20 Lessons — Lesson Batch Size: "the maximum preferred lesson
     * batch size." Range-checked below rather than with a narrower Postgres
     * type — the spec's 3-15 bound is a product decision, not a storage
     * constraint, and a `smallint` would express the same rule less clearly.
     */
    lessonBatchSize: integer("lesson_batch_size").notNull().default(6),
    /**
     * Spec 20 Lessons — Auto Pronunciation. The spec gives every other
     * toggle an explicit default except this one; `true` was chosen as the
     * lower-friction default for a feature that only ever adds an audio cue
     * a learner can already trigger manually (see
     * `components/lessons/lesson-session-view.tsx`'s auto-pronounce effect).
     */
    autoPronounceLessons: boolean("auto_pronounce_lessons").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.languageId] }),
    // Accepts both the old and new "choose one group" spelling — a row can
    // transiently be either between this migration and the data-backfill
    // migration that follows it, and neither spelling is ever wrong to allow.
    // This constraint intentionally lives in its own migration, separate
    // from the one that added `choose_group` to the enum — see that
    // migration's note on why (Postgres forbids using a freshly added enum
    // value, including inside a CHECK constraint's validation of existing
    // rows, within the same transaction that added it).
    check(
      "user_language_settings_theme_selection_consistency",
      sql`${t.selectedVocabularyGroupId} IS NULL OR ${t.curriculumMode} IN ('theme', 'choose_group')`,
    ),
    check("user_language_settings_batch_size_range", sql`${t.lessonBatchSize} BETWEEN 3 AND 15`),
    // A selected group must belong to the same language as the settings row
    // it lives on — cross-language selection is made unrepresentable rather
    // than merely discouraged, the same technique `learning_items` uses.
    foreignKey({
      name: "user_language_settings_group_language_fk",
      columns: [t.selectedVocabularyGroupId, t.languageId],
      foreignColumns: [vocabularyGroups.id, vocabularyGroups.languageId],
    }).onDelete("restrict"),
    index("user_language_settings_selected_group_idx").on(t.selectedVocabularyGroupId),
  ],
);

/**
 * Account-wide General settings (spec 20). One row per user, created only
 * once the learner changes something — the "Effective Defaults" pattern the
 * spec asks for explicitly: `stored preference ?? Polyglot default`, so no
 * account needs a fully populated row. Both defaults here are `false`,
 * matching spec 20's stated defaults for these two toggles exactly.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  hideEnglishReviews: boolean("hide_english_reviews").notNull().default(false),
  showNsfwContent: boolean("show_nsfw_content").notNull().default(false),
  ...timestamps(),
});

/**
 * Spec 20 General — Vacation Mode. Account-wide (no `language_id`) —
 * "applies to the learner's entire account, not only the active language."
 * A row is a real historical vacation period, not a boolean flag:
 * completed vacations still matter for schedule reconciliation
 * (`domains/srs`'s `calculateVacationAdjustedReview`) and, once Danger
 * Zone's manual streak lands (spec 20 unit 22), for treating those
 * calendar days as neutral.
 *
 * `ended_at IS NULL` means "currently on vacation." The partial unique
 * index is the actual concurrency guarantee behind "only one active
 * vacation period may exist for a user" and "enabling Vacation Mode twice
 * should not create duplicate active periods" — enforced by the database,
 * not by an application-level check-then-insert.
 */
export const userVacationPeriods = pgTable(
  "user_vacation_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("user_vacation_periods_one_active_per_user").on(t.userId).where(sql`${t.endedAt} IS NULL`),
    index("user_vacation_periods_user_id_started_at_idx").on(t.userId, t.startedAt.desc()),
  ],
);

/**
 * Spec 20 Reviews — Review Types. `cloze_manual` is the spec's own default
 * (shown pre-selected in its mockup and listed first among the three
 * options) for both content types.
 */
export const reviewTypeEnum = pgEnum("review_type", ["cloze_manual", "cloze_flashcard", "flashcard"]);

/**
 * Spec 20 Reviews — Review Hints. `nuance_first` and `hint` are the spec's
 * own stated defaults. Order only matters under Hint Mode "more" (the only
 * mode with two separate pieces of content to reveal) — see
 * `domains/srs/review-hint.ts`'s `resolveReviewHint`.
 */
export const hintOrderEnum = pgEnum("hint_order", ["nuance_first", "translation_first"]);
export const hintModeEnum = pgEnum("hint_mode", ["hide", "hint", "show", "more", "always_show_nuance"]);

/** Spec 20 Review UI — Undo Action. `clear_last_character` is the spec's own stated default. */
export const undoActionEnum = pgEnum("undo_action", ["clear_last_character", "clear_all_characters"]);

/**
 * Per-learner, per-language review preferences (spec 20 Reviews) — what the
 * spec's own Settings Data Model describes as a much larger table (Ghost
 * mode, Leech minimums, SRS Strictness/Interval, queue timing, Fluent Mode
 * all still land on this same row in later units). Unit 10 seeded the two
 * review-type columns; unit 11 adds Review Hints (four columns) and Review
 * UI (seven columns) — see progress-tracker.md.
 *
 * Language-scoped like `userLanguageSettings`, for the same reason: a
 * learner studying two languages makes independent choices for each.
 * Unlike `userLanguageSettings.curriculumMode`, there is no "row absent
 * means never chosen" state to preserve here — every column has a real
 * default and effective-default reads never require a row to exist
 * (`domains/srs`'s `findReviewPreferences` upserts on first change).
 */
export const userReviewPreferences = pgTable(
  "user_review_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    grammarReviewType: reviewTypeEnum("grammar_review_type").notNull().default("cloze_manual"),
    vocabularyReviewType: reviewTypeEnum("vocabulary_review_type").notNull().default("cloze_manual"),
    grammarHintOrder: hintOrderEnum("grammar_hint_order").notNull().default("nuance_first"),
    vocabularyHintOrder: hintOrderEnum("vocabulary_hint_order").notNull().default("nuance_first"),
    grammarHintMode: hintModeEnum("grammar_hint_mode").notNull().default("hint"),
    vocabularyHintMode: hintModeEnum("vocabulary_hint_mode").notNull().default("hint"),
    /**
     * Spec 20 Review UI. No stated default for `autoplayAudio`,
     * `autoHighlightErrors`, or `showSrsStage` — chosen `true` as the
     * lower-friction default for a presentational aid the learner can
     * already get to manually, matching Lessons' Auto Pronunciation
     * default (spec 20 unit 9). `lightningMode`, `focusMode`, and
     * `autoExpandInfo` default `false` — each is a real interaction-flow
     * change, not just an added cue, matching this spec's other opt-in
     * behavior toggles (Vacation Mode, NSFW Content).
     */
    autoplayAudio: boolean("autoplay_audio").notNull().default(true),
    lightningMode: boolean("lightning_mode").notNull().default(false),
    focusMode: boolean("focus_mode").notNull().default(false),
    autoHighlightErrors: boolean("auto_highlight_errors").notNull().default(true),
    showSrsStage: boolean("show_srs_stage").notNull().default(true),
    autoExpandInfo: boolean("auto_expand_info").notNull().default(false),
    undoAction: undoActionEnum("undo_action").notNull().default("clear_last_character"),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.languageId] })],
);
