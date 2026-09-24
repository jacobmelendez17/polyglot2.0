import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { languages } from "./languages";
import { users } from "./users";

/**
 * The practice activities a learner can complete (architecture.md's
 * `practice` domain). Mirrors `domains/practice`'s `PRACTICE_TYPES`; adding
 * a value here is additive and safe against the previously deployed app.
 */
export const practiceTypeEnum = pgEnum("practice_type", [
  "listening",
  "speaking",
  "stories",
  "sentences",
  "journal",
  "conjugation",
]);

/**
 * One row per *completed* practice session, the source of the Practice hub's
 * "N this week" and "last practiced" figures. It is an activity log only:
 * nothing here is an SRS stage, a review time, or a skill-progression value,
 * so it can never affect curriculum progress (code-standards.md's Practice
 * Standards). Skill progression, when it is specified, gets its own tables.
 *
 * Rows are written by each practice's own completion flow, not by the hub —
 * no writer exists until the first practice ships.
 */
export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    practiceType: practiceTypeEnum("practice_type").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The hub reads one learner's recent sessions for one language, and the
    // most recent session per practice type.
    index("practice_sessions_user_language_completed_idx").on(
      t.userId,
      t.languageId,
      t.completedAt,
    ),
  ],
);
