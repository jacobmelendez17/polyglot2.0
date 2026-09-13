import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgEnum, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { vocabularyGroups } from "./curriculum";
import { languages } from "./languages";
import { users } from "./users";

/**
 * How new curriculum is introduced to a learner (spec 16, "Curriculum
 * Decider"):
 *
 * - `theme` — work through one chosen vocabulary theme at a time
 * - `random` — mix eligible vocabulary and grammar randomly
 * - `balanced` — spread the vocabulary portion across the available themes
 *
 * Lowercase values matching every other enum in this schema, not the spec's
 * conceptual `THEME`/`RANDOM`/`BALANCED` spelling. The mode changes *only*
 * how the next batch is selected — never SRS state, unlock rules, or what
 * the level eventually teaches.
 */
export const curriculumModeEnum = pgEnum("curriculum_mode", ["theme", "random", "balanced"]);

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
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.languageId] }),
    check(
      "user_language_settings_theme_selection_consistency",
      sql`${t.selectedVocabularyGroupId} IS NULL OR ${t.curriculumMode} = 'theme'`,
    ),
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
