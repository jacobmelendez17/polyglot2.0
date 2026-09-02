import { pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { learningItems } from "./curriculum";
import { users } from "./users";

/** Spec 08 §8 — Synonym Side. A synonym accepted for `gato → cat` isn't necessarily acceptable for `cat → gato` (spec 07 §23's bidirectional testing), so side is explicit rather than one untyped list. */
export const synonymSideEnum = pgEnum("synonym_side", ["term", "meaning"]);

/**
 * Learner-owned notes (spec 08 §72). Private by default — never returned for
 * any user other than the owner (enforced at the repository boundary).
 */
export const userNotes = pgTable(
  "user_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (t) => [unique("user_notes_user_learning_item_key").on(t.userId, t.learningItemId)],
);

/**
 * Learner-owned synonyms (spec 08 §72). Stores both the original `value` and
 * a `normalized_value` — normalization is performed by a shared module the
 * future centralized answer checker (spec 07 §24) also consumes.
 */
export const userSynonyms = pgTable(
  "user_synonyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    learningItemId: uuid("learning_item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "restrict" }),
    side: synonymSideEnum("side").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("user_synonyms_user_item_side_normalized_key").on(
      t.userId,
      t.learningItemId,
      t.side,
      t.normalizedValue,
    ),
  ],
);
