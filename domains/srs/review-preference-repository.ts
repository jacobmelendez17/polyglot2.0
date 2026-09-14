import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userReviewPreferences } from "@/db/schema";

import { DEFAULT_REVIEW_PREFERENCES } from "./review-preference";
import type { HintMode, HintOrder, ReviewPreferences, ReviewType, ReviewUiToggleField, SrsIntervalMode, SrsStrictness, UndoAction } from "./review-preference";

/**
 * Takes an injected `DbClient` rather than the app's `db` singleton — same
 * reason as every other repository in this codebase (see `domains/users/
 * user-repository.ts`'s docstring): `db/client.ts` throws outside Next's
 * webpack build, including under Vitest, so injecting keeps this testable
 * against a real, rolled-back transaction and importable from `domains/srs/
 * review-orchestration.ts`, which must stay database-secret-free.
 */

type ReviewPreferencesRow = typeof userReviewPreferences.$inferSelect;

function toReviewPreferences(row: ReviewPreferencesRow): ReviewPreferences {
  return {
    userId: row.userId,
    languageId: row.languageId,
    grammarReviewType: row.grammarReviewType,
    vocabularyReviewType: row.vocabularyReviewType,
    grammarHintOrder: row.grammarHintOrder,
    vocabularyHintOrder: row.vocabularyHintOrder,
    grammarHintMode: row.grammarHintMode,
    vocabularyHintMode: row.vocabularyHintMode,
    autoplayAudio: row.autoplayAudio,
    lightningMode: row.lightningMode,
    focusMode: row.focusMode,
    autoHighlightErrors: row.autoHighlightErrors,
    showSrsStage: row.showSrsStage,
    autoExpandInfo: row.autoExpandInfo,
    undoAction: row.undoAction,
    grammarSrsStrictness: row.grammarSrsStrictness,
    vocabularySrsStrictness: row.vocabularySrsStrictness,
    grammarSrsIntervalMode: row.grammarSrsIntervalMode,
    vocabularySrsIntervalMode: row.vocabularySrsIntervalMode,
  };
}

/**
 * This learner's review preferences for one language, or the centralized
 * defaults when they have never changed any of them ("Effective Defaults":
 * `stored preference ?? Polyglot default` — no account needs a fully
 * populated row), matching `domains/users`' `getContentPreferences` exactly.
 */
export async function findReviewPreferences(db: DbClient, userId: string, languageId: string): Promise<ReviewPreferences> {
  const [row] = await db
    .select()
    .from(userReviewPreferences)
    .where(and(eq(userReviewPreferences.userId, userId), eq(userReviewPreferences.languageId, languageId)))
    .limit(1);

  return row ? toReviewPreferences(row) : { userId, languageId, ...DEFAULT_REVIEW_PREFERENCES };
}

/**
 * Every narrow mutation below delegates here: one column, one value, an
 * upsert. Every field on this table is independent of every other (spec
 * 20's "Settings Security" — "prefer narrow mutations"), so a single
 * generic helper is what keeps eleven near-identical single-column saves
 * from being copy-pasted eleven times; each exported function below still
 * changes exactly one field per call, same as if it were hand-written.
 */
async function savePreferenceField<Column extends keyof typeof userReviewPreferences.$inferInsert>(
  db: DbClient,
  column: Column,
  input: { userId: string; languageId: string; value: (typeof userReviewPreferences.$inferInsert)[Column] },
): Promise<ReviewPreferences> {
  const [row] = await db
    .insert(userReviewPreferences)
    .values({ userId: input.userId, languageId: input.languageId, [column]: input.value })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { [column]: input.value, updatedAt: new Date() },
    })
    .returning();

  return toReviewPreferences(row);
}

/** Spec 20 Reviews — Grammar Review Type. */
export function saveGrammarReviewType(db: DbClient, input: { userId: string; languageId: string; reviewType: ReviewType }) {
  return savePreferenceField(db, "grammarReviewType", { ...input, value: input.reviewType });
}

/** Spec 20 Reviews — Vocabulary Review Type. */
export function saveVocabularyReviewType(db: DbClient, input: { userId: string; languageId: string; reviewType: ReviewType }) {
  return savePreferenceField(db, "vocabularyReviewType", { ...input, value: input.reviewType });
}

/** Spec 20 Review Hints — Grammar Hint Order. Meaningful only under Grammar Hint Mode "more". */
export function saveGrammarHintOrder(db: DbClient, input: { userId: string; languageId: string; hintOrder: HintOrder }) {
  return savePreferenceField(db, "grammarHintOrder", { ...input, value: input.hintOrder });
}

/** Spec 20 Review Hints — Vocabulary Hint Order. Meaningful only under Vocabulary Hint Mode "more". */
export function saveVocabularyHintOrder(db: DbClient, input: { userId: string; languageId: string; hintOrder: HintOrder }) {
  return savePreferenceField(db, "vocabularyHintOrder", { ...input, value: input.hintOrder });
}

/** Spec 20 Review Hints — Grammar Hint Mode. */
export function saveGrammarHintMode(db: DbClient, input: { userId: string; languageId: string; hintMode: HintMode }) {
  return savePreferenceField(db, "grammarHintMode", { ...input, value: input.hintMode });
}

/** Spec 20 Review Hints — Vocabulary Hint Mode. */
export function saveVocabularyHintMode(db: DbClient, input: { userId: string; languageId: string; hintMode: HintMode }) {
  return savePreferenceField(db, "vocabularyHintMode", { ...input, value: input.hintMode });
}

/** Spec 20 Review UI — one generic save for all seven boolean toggles (Undo Action is a select, not a toggle — see `saveUndoAction`). */
export function saveReviewUiToggle(
  db: DbClient,
  input: { userId: string; languageId: string; field: ReviewUiToggleField; value: boolean },
) {
  return savePreferenceField(db, input.field, { userId: input.userId, languageId: input.languageId, value: input.value });
}

/** Spec 20 Review UI — Undo Action. */
export function saveUndoAction(db: DbClient, input: { userId: string; languageId: string; undoAction: UndoAction }) {
  return savePreferenceField(db, "undoAction", { ...input, value: input.undoAction });
}

/** Spec 20 SRS Strictness — Grammar SRS Strictness. */
export function saveGrammarSrsStrictness(db: DbClient, input: { userId: string; languageId: string; srsStrictness: SrsStrictness }) {
  return savePreferenceField(db, "grammarSrsStrictness", { ...input, value: input.srsStrictness });
}

/** Spec 20 SRS Strictness — Vocabulary SRS Strictness. */
export function saveVocabularySrsStrictness(db: DbClient, input: { userId: string; languageId: string; srsStrictness: SrsStrictness }) {
  return savePreferenceField(db, "vocabularySrsStrictness", { ...input, value: input.srsStrictness });
}

/** Spec 20 SRS Interval — Grammar SRS Interval. */
export function saveGrammarSrsIntervalMode(db: DbClient, input: { userId: string; languageId: string; srsIntervalMode: SrsIntervalMode }) {
  return savePreferenceField(db, "grammarSrsIntervalMode", { ...input, value: input.srsIntervalMode });
}

/** Spec 20 SRS Interval — Vocabulary SRS Interval. */
export function saveVocabularySrsIntervalMode(db: DbClient, input: { userId: string; languageId: string; srsIntervalMode: SrsIntervalMode }) {
  return savePreferenceField(db, "vocabularySrsIntervalMode", { ...input, value: input.srsIntervalMode });
}
