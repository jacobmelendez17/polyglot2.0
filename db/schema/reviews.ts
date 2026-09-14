import { foreignKey, index, integer, pgEnum, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { learningItems, learningItemTypeEnum, sentences } from "./curriculum";
import { languages } from "./languages";
import { srsStageEnum } from "./progress";
import { users } from "./users";

/** Spec 09 §14 — a small stable domain value, matching `domains/srs`'s `ReviewResultCategory`. */
export const reviewResultEnum = pgEnum("review_result", ["advanced", "penalized"]);

/**
 * Durable review-outcome history (spec 09 §14). One row per fully completed
 * review item — never per question/keystroke, and never containing the raw
 * typed answer (spec 09 §20, architecture.md's privacy rules). Aggregate
 * enough to drive future statistics and leech detection; not an immutable
 * answer-by-answer transcript.
 */
export const reviewEvents = pgTable(
  "review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    learningItemId: uuid("learning_item_id").notNull(),
    // Authoritative server time at completion, passed in explicitly by the
    // completion transaction — never `defaultNow()` — matching the rest of
    // this codebase's "caller supplies now" invariant (domains/srs).
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    stageBefore: srsStageEnum("stage_before").notNull(),
    stageAfter: srsStageEnum("stage_after").notNull(),
    requiredQuestionCount: integer("required_question_count").notNull(),
    incorrectAdjustmentCount: integer("incorrect_adjustment_count").notNull().default(0),
    result: reviewResultEnum("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "review_events_learning_item_language_fk",
      columns: [t.learningItemId, t.languageId],
      foreignColumns: [learningItems.id, learningItems.languageId],
    }).onDelete("restrict"),
    // Review history, keyset-paginated (spec 09 §14): (user, language, reviewed_at desc, id desc).
    index("review_events_history_idx").on(t.userId, t.languageId, t.reviewedAt.desc(), t.id.desc()),
    // Future leech-window calculations: (user, learning item, reviewed_at desc).
    index("review_events_item_window_idx").on(t.userId, t.learningItemId, t.reviewedAt.desc()),
  ],
);

/**
 * Spec 20 Ghost Reviews — the four Ghost SRS stages, entirely independent
 * of `srsStageEnum` ("Normal and Ghost SRS must remain separate... Never
 * use one stage field to represent both"). Represents whichever Ghost
 * review is next due, not the one just completed.
 */
export const ghostStageEnum = pgEnum("ghost_stage", ["ghost_1", "ghost_2", "ghost_3", "ghost_4"]);

/**
 * Spec 20 Ghost Reviews — one row per (learner, learning item, sentence)
 * that has ever been missed in a normal review (spec's own
 * `user_sentence_ghost_progress` sketch). A Ghost only ever exists for a
 * *sentence* a normal review actually showed the learner — in practice this
 * means a Cloze-presented question, the only presentation with an example
 * sentence attached at all (`domains/srs/review-cloze.ts`); Flashcard/typed
 * questions have no sentence to attach a Ghost to and can never create one.
 *
 * `ghostStage: null` is a real, distinct state — spec's own "Ghost Review —
 * Minimal": a sentence missed exactly once under Minimal mode is recorded
 * (`missCount: 1`) but not yet an active Ghost. `nextReviewAt: null` covers
 * both that not-yet-activated state and a completed Ghost (`completedAt`
 * set, "Ghost is gone" after Ghost 4 — the row is kept as a completion
 * record, per this table's own `completedAt` column, but stops being due).
 *
 * `contentType` denormalizes `learningItems.type`, never independently
 * decided — same reasoning as `userItemProgress.languageId`: the Ghost
 * queue's due-read is scoped per learner+language+content-type (Grammar
 * Ghost Reviews / Vocabulary Ghost Reviews are independent settings), and
 * this avoids a join to `learning_items` just to filter by it.
 */
export const userSentenceGhostProgress = pgTable(
  "user_sentence_ghost_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    learningItemId: uuid("learning_item_id").notNull(),
    sentenceId: uuid("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "restrict" }),
    contentType: learningItemTypeEnum("content_type").notNull(),
    missCount: integer("miss_count").notNull().default(0),
    ghostStage: ghostStageEnum("ghost_stage"),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // "A learner cannot have duplicate active Ghost state for the same
    // user/language/learning item/sentence" — `learningItemId` alone already
    // determines `languageId` via the compound FK below, so this triple is
    // the real identity.
    unique("user_sentence_ghost_progress_identity_key").on(t.userId, t.learningItemId, t.sentenceId),
    foreignKey({
      name: "user_sentence_ghost_progress_learning_item_language_fk",
      columns: [t.learningItemId, t.languageId],
      foreignColumns: [learningItems.id, learningItems.languageId],
    }).onDelete("restrict"),
    // The Ghost due-review path, mirroring `user_item_progress_due_review_idx`.
    index("user_sentence_ghost_progress_due_review_idx").on(t.userId, t.languageId, t.nextReviewAt),
  ],
);
