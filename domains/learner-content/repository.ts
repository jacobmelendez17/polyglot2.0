import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userNotes, userSynonyms } from "@/db/schema";
import { normalizeForComparison } from "@/lib/answer-checking/normalize";

import type { LearnerNote, LearnerSynonym, SynonymSide } from "./types";

/**
 * Learner-owned content repository (spec 08 §72). Every read is scoped by a
 * required `userId`, so a caller cannot accidentally fetch another user's
 * private notes/synonyms — there is no "get all notes" function. No editing
 * UI exists yet (spec's explicit scope boundary); the write functions here
 * exist for fixtures/tests and future consumers to share, not a UI.
 *
 * Takes an injected `DbClient`, not the `db` singleton — see
 * `domains/users/user-repository.ts` for why.
 */

function toLearnerNote(row: typeof userNotes.$inferSelect): LearnerNote {
  return {
    id: row.id,
    userId: row.userId,
    learningItemId: row.learningItemId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLearnerSynonym(row: typeof userSynonyms.$inferSelect): LearnerSynonym {
  return {
    id: row.id,
    userId: row.userId,
    learningItemId: row.learningItemId,
    side: row.side,
    value: row.value,
    normalizedValue: row.normalizedValue,
  };
}

export async function getNote(db: DbClient, userId: string, learningItemId: string): Promise<LearnerNote | null> {
  const [row] = await db
    .select()
    .from(userNotes)
    .where(and(eq(userNotes.userId, userId), eq(userNotes.learningItemId, learningItemId)))
    .limit(1);
  return row ? toLearnerNote(row) : null;
}

export async function createNote(
  db: DbClient,
  input: { userId: string; learningItemId: string; body: string },
): Promise<LearnerNote> {
  const [row] = await db.insert(userNotes).values(input).returning();
  return toLearnerNote(row);
}

export async function getSynonyms(db: DbClient, userId: string, learningItemId: string): Promise<LearnerSynonym[]> {
  const rows = await db
    .select()
    .from(userSynonyms)
    .where(and(eq(userSynonyms.userId, userId), eq(userSynonyms.learningItemId, learningItemId)));
  return rows.map(toLearnerSynonym);
}

/** Normalizes `value` via the module shared with `lib/answer-checking` (spec 08 §72) before storing it. */
export async function createSynonym(
  db: DbClient,
  input: { userId: string; learningItemId: string; side: SynonymSide; value: string },
): Promise<LearnerSynonym> {
  const [row] = await db
    .insert(userSynonyms)
    .values({ ...input, normalizedValue: normalizeForComparison(input.value) })
    .returning();
  return toLearnerSynonym(row);
}
