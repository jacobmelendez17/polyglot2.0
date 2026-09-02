import { foreignKey, index, integer, pgEnum, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { learningItems, levels } from "./curriculum";
import { users } from "./users";

/** Spec 08 §8 — SRS Stages. Explicit identifiers; business logic must never depend on enum ordinal position (see domains/srs). */
export const srsStageEnum = pgEnum("srs_stage", [
  "beginner_1",
  "beginner_2",
  "beginner_3",
  "beginner_4",
  "familiar_1",
  "familiar_2",
  "intermediate",
  "master",
  "fluent",
]);

/**
 * Learner-specific state for a shared official learning item (spec 08 §24,
 * §25). **A row exists only once the item has been enrolled** — `srs_stage`
 * is `NOT NULL`, there is no "row exists but not learned" state. Whether an
 * item is merely *unlocked* lives entirely in `user_level_progress`; blurring
 * the two into one nullable column here was explicitly rejected by the spec.
 *
 * `language_id` is a deliberate denormalization (derivable through
 * `learning_items`) purely so the due-review query — filtered by user,
 * language, and next-review time — can be indexed; a composite index can't
 * span a join. It's kept honest by the composite foreign key below, which
 * makes a progress row whose `language_id` disagrees with its learning
 * item's unrepresentable.
 */
export const userItemProgress = pgTable(
  "user_item_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    learningItemId: uuid("learning_item_id").notNull(),
    languageId: uuid("language_id").notNull(),
    srsStage: srsStageEnum("srs_stage").notNull(),
    learnedAt: timestamp("learned_at", { withTimezone: true }).notNull().defaultNow(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    fluentAt: timestamp("fluent_at", { withTimezone: true }),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    // Optimistic-concurrency guard for future review mutations (spec 08 §26) — not consumed yet.
    version: integer("version").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    // Business identity is "user + learning item"; also serves as the index
    // for "progress by user" and "progress by user + item" (spec 08 §41) via
    // its leftmost-prefix, so neither needs a separate index.
    primaryKey({ columns: [t.userId, t.learningItemId] }),
    foreignKey({
      name: "user_item_progress_learning_item_language_fk",
      columns: [t.learningItemId, t.languageId],
      foreignColumns: [learningItems.id, learningItems.languageId],
    }).onDelete("restrict"),
    // The due-review path (spec 08 §41) — the reason language_id is denormalized onto this table at all.
    index("user_item_progress_due_review_idx").on(t.userId, t.languageId, t.nextReviewAt),
    // Supports the learning_item_id/language_id foreign key and level-stage aggregate joins through learning_items.
    index("user_item_progress_learning_item_idx").on(t.learningItemId, t.languageId),
  ],
);

/**
 * Persistent level-unlock state (spec 08 §28). Once a level is legitimately
 * unlocked, the earned unlock persists even if the learner's current SRS
 * distribution would no longer qualify — this table is the record of that,
 * not a live computation. Level 1 is unlocked at provisioning (§11); every
 * other unlock is earned by later progress-domain operations.
 */
export const userLevelProgress = pgTable(
  "user_level_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "restrict" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // (user_id, level_id) uniqueness as the primary key; also covers "user_level_progress by user" (spec 08 §41) via its leftmost prefix.
    primaryKey({ columns: [t.userId, t.levelId] }),
  ],
);
