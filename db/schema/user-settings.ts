import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { vocabularyGroups } from "./curriculum";
import { languages } from "./languages";
import { srsStageEnum } from "./progress";
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
 * Spec 20 Danger Zone — Manually Set Streak. Append-only history (an `id`
 * primary key, not `user_id`) rather than one upserted row per user — the
 * spec's own suggested shape, and matching Danger Zone's other operations'
 * audit-trail spirit. Only the most recent row per user is ever read for
 * the "current manual streak adjustment" (`domains/dashboard/
 * dashboard-aggregation.ts`'s `calculateCurrentStreakLength` reads it as a
 * `StreakAdjustmentAnchor`, keyed by the calendar date this row's
 * `created_at` falls on in the learner's timezone) — older rows are kept
 * only as a record of what was set and when, never replayed or summed.
 * "Do not insert fake review events" — this is the entire mechanism;
 * nothing here ever touches `review_events`.
 */
export const userStreakAdjustments = pgTable(
  "user_streak_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    ...timestamps(),
  },
  (t) => [index("user_streak_adjustments_user_id_created_at_idx").on(t.userId, t.createdAt.desc())],
);

/**
 * Spec 20 Danger Zone — Reset Dismissable Warnings. Storage only, matching
 * this spec's own repeated "store the preference now, the delivery/consumer
 * doesn't exist yet" pattern (Notifications, unit 19): no code anywhere in
 * this app yet writes a dismissal, since no "Don't show this message
 * again" warning exists to dismiss. `noticeKey` is a stable semantic
 * identifier the spec explicitly requires ("do not use the English UI copy
 * itself as the identifier" — e.g. `VACATION_LESSON_WARNING`), never a
 * free-text message; a future warning's dismiss control writes here using
 * that same key, and Danger Zone's Reset action (already built this unit)
 * deletes every row for the authenticated user regardless of key.
 */
export const userDismissedNotices = pgTable(
  "user_dismissed_notices",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noticeKey: text("notice_key").notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.noticeKey] })],
);

/**
 * Spec 20 Delete Account. The spec's own suggested shape exactly — no
 * token/hash columns, unlike its literal "if Polyglot must own a token,
 * store only a secure hash" guidance, because this codebase's
 * confirmation step does not issue a Polyglot-owned token at all (see
 * `domains/danger-zone/account-deletion-service.ts`'s docstring for the
 * full reasoning: no email-delivery infrastructure exists anywhere in
 * this app, and Clerk's own reverification API is explicitly marked beta/
 * "not recommended for production use", so confirmation is gated by a
 * typed confirmation phrase inside an authenticated session instead,
 * matching Reset Entire Account's own pattern — there is no secret to
 * hash and store).
 *
 * `NULL` columns carry the state machine: `confirmed_at IS NULL` means
 * still awaiting confirmation; `delete_after` is only ever set alongside
 * `confirmed_at` (the moment "account enters pending deletion" begins);
 * `cancelled_at`/`completed_at` are the two terminal states, mutually
 * exclusive by construction (the service never sets both).
 */
export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deleteAfter: timestamp("delete_after", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // "The user may cancel at any time before delete_after" implies only one
    // live request matters at a time — this is the concurrency guarantee
    // behind that, the same partial-unique-index technique
    // `user_vacation_periods_one_active_per_user` already uses for an
    // analogous "only one active X per user" rule.
    uniqueIndex("account_deletion_requests_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.cancelledAt} IS NULL AND ${t.completedAt} IS NULL`),
    // The Vercel Cron finalize job's own query: every confirmed, not yet
    // cancelled/completed request whose delete_after has passed.
    index("account_deletion_requests_due_idx")
      .on(t.deleteAfter)
      .where(sql`${t.confirmedAt} IS NOT NULL AND ${t.cancelledAt} IS NULL AND ${t.completedAt} IS NULL`),
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
 * Spec 20 SRS Strictness. `one_stage` is the spec's own stated default —
 * the new Polyglot-wide default incorrect rule ("any incorrect normal SRS
 * result drops exactly 1 stage"), replacing the old WaniKani-inspired
 * Beginner/Familiar+ split outright (spec: "must no longer exist as the
 * default... do not leave the old 2-stage Familiar+ logic reachable through
 * another code path" — see `domains/srs/review-result.ts`).
 */
export const srsStrictnessEnum = pgEnum("srs_strictness", ["one_stage", "two_stages", "three_stages", "half", "full"]);

/**
 * Spec 20 SRS Interval. `default` is the spec's own stated default (shown
 * pre-selected in its mockup). Unlike SRS Strictness (which only changes
 * incorrect-review demotion), this changes how far out a *correct* review's
 * next due date lands — but never retroactively: an existing
 * `next_review_at` keeps its value even after the learner changes this
 * setting (spec's own "Important Future-Only Rule") — see
 * `domains/srs/srs-config.ts`.
 */
export const srsIntervalModeEnum = pgEnum("srs_interval_mode", ["shortest", "shorter", "default", "longer", "longest"]);

/**
 * Spec 20 Review Queue Timing. `start_of_hour` is the spec's own stated
 * default. Unlike every other Reviews setting so far, this is **one value
 * per language, not split grammar/vocabulary** — the spec's own "Language-
 * Specific Settings" list names it once ("Review Queue Timing"), unlike the
 * paired "Grammar X / Vocabulary X" entries around it. Applied as the last
 * step of the SRS scheduling pipeline, after the interval-derived raw due
 * time and regardless of whether that completion advanced or was penalized
 * — see `domains/srs/review-queue-timing.ts`.
 */
export const reviewQueueTimingModeEnum = pgEnum("review_queue_timing_mode", ["start_of_hour", "start_of_day"]);

/**
 * Spec 20 Ghost Reviews. `on` is the spec's own stated default (shown
 * pre-selected in its mockup, listed first among the three options) — see
 * `db/schema/reviews.ts`'s `userSentenceGhostProgress` for the Ghost state
 * this setting governs.
 */
export const ghostModeEnum = pgEnum("ghost_mode", ["on", "minimal", "off"]);

/**
 * Per-learner, per-language review preferences (spec 20 Reviews). Unit 10
 * seeded the two review-type columns; unit 11 added Review Hints (four
 * columns) and Review UI (seven columns); unit 12 added SRS Strictness (two
 * columns); unit 13 added SRS Interval (two columns); unit 14 added Review
 * Queue Timing (one column); unit 15 added Fluent Mode (two columns); unit
 * 16 added Ghost Reviews (two columns); unit 17 adds Leeches' Minimum SRS
 * (two columns) — see progress-tracker.md.
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
    grammarGhostMode: ghostModeEnum("grammar_ghost_mode").notNull().default("on"),
    vocabularyGhostMode: ghostModeEnum("vocabulary_ghost_mode").notNull().default("on"),
    grammarSrsStrictness: srsStrictnessEnum("grammar_srs_strictness").notNull().default("one_stage"),
    vocabularySrsStrictness: srsStrictnessEnum("vocabulary_srs_strictness").notNull().default("one_stage"),
    grammarSrsIntervalMode: srsIntervalModeEnum("grammar_srs_interval_mode").notNull().default("default"),
    vocabularySrsIntervalMode: srsIntervalModeEnum("vocabulary_srs_interval_mode").notNull().default("default"),
    reviewQueueTiming: reviewQueueTimingModeEnum("review_queue_timing").notNull().default("start_of_hour"),
    /**
     * Spec 20 Fluent Mode. `true` (ON) is the spec's own stated default for
     * both content types. When ON, an item reaching Fluent gets a 6-calendar
     * -month maintenance schedule instead of terminating — see
     * `domains/srs/review-completion.ts` and `domains/progress/repository.ts`'s
     * `reconcileFluentSchedules` (the toggle's own cascading effect on
     * already-Fluent items, spec's "Turning Fluent Mode Off"/"Existing
     * Fluent Items" sections).
     */
    grammarFluentMode: boolean("grammar_fluent_mode").notNull().default(true),
    vocabularyFluentMode: boolean("vocabulary_fluent_mode").notNull().default(true),
    /**
     * Spec 20 Leeches — Minimum SRS for Leech. `familiar_1` is the spec's
     * own stated default. "The item cannot be classified as a Leech until
     * it has reached at least that selected stage at least once" — checked
     * against `user_item_progress.highest_srs_stage_reached`, never the
     * item's current stage (spec's own example: an item that reached Master
     * and later fell to Beginner 4 still satisfies this).
     */
    grammarMinimumLeechStage: srsStageEnum("grammar_minimum_leech_stage").notNull().default("familiar_1"),
    vocabularyMinimumLeechStage: srsStageEnum("vocabulary_minimum_leech_stage").notNull().default("familiar_1"),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.languageId] })],
);

/**
 * Spec 20 Notifications. Account-wide (no `language_id`), same "Effective
 * Defaults" shape as `userPreferences`: no row means every optional email
 * category resolves to `true` (spec's own "Absence of a row resolves to all
 * true for these optional categories"). All four default `true`, matching
 * the spec's stated default for every toggle in this section exactly.
 *
 * Transactional Emails has no column here — the spec gives it no toggle at
 * all ("cannot be disabled"), so there is nothing to store.
 *
 * Storing a preference here never sends anything: "the actual optional
 * email-delivery provider/workflow is deferred... do not send fake/
 * nonexistent emails simply because a toggle exists." No email-sending code
 * exists anywhere in this codebase as of spec 20 unit 19.
 */
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  newsUpdates: boolean("news_updates").notNull().default(true),
  progressEmail: boolean("progress_email").notNull().default(true),
  inactivityEmail: boolean("inactivity_email").notNull().default(true),
  trialEmail: boolean("trial_email").notNull().default(true),
  ...timestamps(),
});
