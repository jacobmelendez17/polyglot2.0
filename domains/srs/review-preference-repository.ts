import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userReviewPreferences } from "@/db/schema";

import { DEFAULT_REVIEW_PREFERENCES } from "./review-preference";
import type { ReviewPreferences, ReviewType } from "./review-preference";

/**
 * Takes an injected `DbClient` rather than the app's `db` singleton — same
 * reason as every other repository in this codebase (see `domains/users/
 * user-repository.ts`'s docstring): `db/client.ts` throws outside Next's
 * webpack build, including under Vitest, so injecting keeps this testable
 * against a real, rolled-back transaction and importable from `domains/srs/
 * review-orchestration.ts`, which must stay database-secret-free.
 */

/**
 * This learner's review-type preferences for one language, or the
 * centralized defaults when they have never changed either ("Effective
 * Defaults": `stored preference ?? Polyglot default` — no account needs a
 * fully populated row), matching `domains/users`' `getContentPreferences`
 * exactly.
 */
export async function findReviewPreferences(db: DbClient, userId: string, languageId: string): Promise<ReviewPreferences> {
  const [row] = await db
    .select()
    .from(userReviewPreferences)
    .where(and(eq(userReviewPreferences.userId, userId), eq(userReviewPreferences.languageId, languageId)))
    .limit(1);

  return row
    ? { userId, languageId, grammarReviewType: row.grammarReviewType, vocabularyReviewType: row.vocabularyReviewType }
    : { userId, languageId, ...DEFAULT_REVIEW_PREFERENCES };
}

async function saveReviewType(
  db: DbClient,
  column: "grammarReviewType" | "vocabularyReviewType",
  input: { userId: string; languageId: string; reviewType: ReviewType },
): Promise<ReviewPreferences> {
  const [row] = await db
    .insert(userReviewPreferences)
    .values({ userId: input.userId, languageId: input.languageId, [column]: input.reviewType })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { [column]: input.reviewType, updatedAt: new Date() },
    })
    .returning();

  return {
    userId: row.userId,
    languageId: row.languageId,
    grammarReviewType: row.grammarReviewType,
    vocabularyReviewType: row.vocabularyReviewType,
  };
}

/** Spec 20 Reviews — Grammar Review Type. Independent of `vocabularyReviewType`, matching every other narrow Settings mutation in this spec. */
export async function saveGrammarReviewType(
  db: DbClient,
  input: { userId: string; languageId: string; reviewType: ReviewType },
): Promise<ReviewPreferences> {
  return saveReviewType(db, "grammarReviewType", input);
}

/** Spec 20 Reviews — Vocabulary Review Type. Independent of `grammarReviewType`. */
export async function saveVocabularyReviewType(
  db: DbClient,
  input: { userId: string; languageId: string; reviewType: ReviewType },
): Promise<ReviewPreferences> {
  return saveReviewType(db, "vocabularyReviewType", input);
}
