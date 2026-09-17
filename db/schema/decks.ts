import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { languages } from "./languages";
import { learningItems, levels } from "./curriculum";
import { users } from "./users";

/**
 * Spec 14 — Deck Types. `polyglot` decks are admin-authored and immutable
 * to learners; `personal` decks belong to exactly one user. Both reference
 * canonical curriculum items through `deck_items` and never duplicate
 * vocabulary or grammar content.
 */
export const deckKindEnum = pgEnum("deck_kind", ["polyglot", "personal"]);

/**
 * Spec 14 — Polyglot Deck Availability.
 *
 * - `level`: the whole deck stays hidden until `gate_level_id` is unlocked,
 *   and then exposes every configured item (spec 14's "Once available, they
 *   reference the curriculum items configured for that deck").
 * - `theme`: the deck is always visible and exposes only the configured
 *   items the learner has actually reached, growing on its own as more
 *   items are learned.
 *
 * Personal decks are always `theme` — their items were eligible when added,
 * and the same per-item filter keeps a deck coherent after an account or
 * level reset removes the underlying progress.
 */
export const deckAvailabilityEnum = pgEnum("deck_availability", [
  "level",
  "theme",
]);

/**
 * A study deck (spec 14). Deck study is deliberately disconnected from
 * official curriculum progression: nothing here records an SRS stage, a
 * review time, or a practice result, and no deck row is ever read when
 * deciding curriculum unlocks. `(id, language_id)` is unique so `deck_items`
 * can use a composite foreign key and make a cross-language deck item
 * unrepresentable rather than merely discouraged — the same technique
 * `db/schema/curriculum.ts` uses for levels and groups.
 */
export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    kind: deckKindEnum("kind").notNull(),
    /** The owning learner for a personal deck; always NULL for a Polyglot deck. */
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    availability: deckAvailabilityEnum("availability").notNull(),
    /** Required by, and only meaningful for, a `level` deck — the level whose unlock reveals it. */
    gateLevelId: uuid("gate_level_id").references(() => levels.id, {
      onDelete: "restrict",
    }),
    ...timestamps(),
  },
  (t) => [
    unique("decks_id_language_id_key").on(t.id, t.languageId),
    // The `/decks` page reads exactly these two sets: this user's own decks,
    // and every Polyglot deck for the active language.
    index("decks_owner_language_idx").on(t.ownerUserId, t.languageId),
    index("decks_kind_language_idx").on(t.kind, t.languageId),
    // One check encoding the whole valid shape, so an ownerless personal
    // deck, an owned official deck, a level deck with no gate, or a
    // level-gated personal deck are all impossible at the database level and
    // not merely rejected by application code.
    check(
      "decks_shape_check",
      sql`(
        (kind = 'personal' AND owner_user_id IS NOT NULL AND availability = 'theme' AND gate_level_id IS NULL)
        OR (kind = 'polyglot' AND owner_user_id IS NULL AND availability = 'theme' AND gate_level_id IS NULL)
        OR (kind = 'polyglot' AND owner_user_id IS NULL AND availability = 'level' AND gate_level_id IS NOT NULL)
      )`,
    ),
  ],
);

/**
 * The ordered membership of a deck (spec 14). A reference to a canonical
 * `learning_items` row — never a copy of its content — so editing or moving
 * official curriculum is automatically reflected in every deck that
 * contains it.
 *
 * `language_id` is carried here purely so the two composite foreign keys
 * below can pin the deck and the learning item to the same language. The
 * `ON DELETE cascade` on the deck side is what makes deleting a personal
 * deck a single statement; the learning-item side stays `restrict`, because
 * official curriculum is archived rather than deleted when anything
 * references it.
 */
export const deckItems = pgTable(
  "deck_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id").notNull(),
    languageId: uuid("language_id").notNull(),
    learningItemId: uuid("learning_item_id").notNull(),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [
    // An item appears at most once in a given deck; it may appear in any
    // number of different decks (spec 14's "The same curriculum item may
    // appear in multiple decks").
    unique("deck_items_deck_id_learning_item_id_key").on(
      t.deckId,
      t.learningItemId,
    ),
    // Deck order is explicit and never insertion order. Reordering writes
    // negative placeholder positions first — see `reorderDeckItems`.
    unique("deck_items_deck_id_position_key").on(t.deckId, t.position),
    foreignKey({
      name: "deck_items_deck_language_fk",
      columns: [t.deckId, t.languageId],
      foreignColumns: [decks.id, decks.languageId],
    }).onDelete("cascade"),
    foreignKey({
      name: "deck_items_learning_item_language_fk",
      columns: [t.learningItemId, t.languageId],
      foreignColumns: [learningItems.id, learningItems.languageId],
    }).onDelete("restrict"),
    index("deck_items_learning_item_idx").on(t.learningItemId),
  ],
);
