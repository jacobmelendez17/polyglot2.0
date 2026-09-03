import { foreignKey, index, integer, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { learningItems } from "./curriculum";
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
