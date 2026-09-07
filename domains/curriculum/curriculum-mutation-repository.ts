import { and, count, eq, sql, TransactionRollbackError } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  acceptedAnswers,
  curriculumItemDrafts,
  grammarItems,
  learningItemSentences,
  learningItems,
  levels,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { normalizeForComparison } from "@/lib/answer-checking/normalize";

import type {
  AcceptedAnswerInput,
  DuplicateCandidate,
  GrammarFieldsInput,
  VocabularyFieldsInput,
} from "./curriculum-mutation-types";
import type { CurriculumStatus } from "./curriculum-db-types";
import type { LevelValidationCounts } from "./curriculum-validation-config";

/**
 * Postgres's integrity-constraint-violation SQLSTATEs relevant to a blocked
 * delete. `23001` (`restrict_violation`) is what an `ON DELETE RESTRICT`
 * constraint actually raises — confirmed directly against real Postgres in
 * this file's own integration test, which first (wrongly) assumed the more
 * generic `23503` (`foreign_key_violation`, raised on invalid insert/update
 * references, not on a blocked delete) and failed for real. Checking both
 * is a deliberate defensive choice, not evidence either guess was right.
 */
const RESTRICT_VIOLATION_SQLSTATES = ["23001", "23503"];

function hasSqlState(error: unknown, sqlStates: string[]): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  // Same driver-wrapping quirk `domains/idempotency/with-idempotency.ts` documents:
  // the raw Neon driver error's `.code` ends up nested under Drizzle's `.cause`.
  const causeCode = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  return sqlStates.includes(code as string) || sqlStates.includes(causeCode as string);
}

/**
 * Structural curriculum mutations (spec 11 rewrite) — raw, composable
 * building blocks, injected `DbClient`, matching every other repository in
 * this codebase. Idempotency wrapping, audit recording, and cache
 * invalidation are `domains/admin`'s job (`publication-service.ts`), not
 * this file's — mirrors how `domains/progress/repository.ts`'s functions
 * are raw building blocks that `domains/srs/review-completion.ts` composes.
 */

export type LockedLearningItem = {
  id: string;
  languageId: string;
  levelId: string;
  type: "vocabulary" | "grammar";
  status: "draft" | "pending" | "published" | "archived";
  version: number;
  position: number;
};

/** Row-locks a learning item for an edit/publish/archive/delete/move (`SELECT ... FOR UPDATE`) — call inside the caller's transaction. */
export async function lockLearningItemForEdit(db: DbClient, learningItemId: string): Promise<LockedLearningItem | null> {
  const [row] = await db.select().from(learningItems).where(eq(learningItems.id, learningItemId)).for("update");
  return row ?? null;
}

/** The next free `position` (and, by the same convention, `lesson_priority`) within one level+type — "append at the end," matching `moveLearningItem`'s identical convention for an item moved into a new level. */
export async function getNextPosition(db: DbClient, levelId: string, type: "vocabulary" | "grammar"): Promise<number> {
  const [{ maxPosition }] = await db
    .select({ maxPosition: sql<number>`coalesce(max(${learningItems.position}), 0)` })
    .from(learningItems)
    .where(and(eq(learningItems.levelId, levelId), eq(learningItems.type, type)));
  return maxPosition + 1;
}

async function replaceAcceptedAnswers(db: DbClient, learningItemId: string, answers: AcceptedAnswerInput[]): Promise<void> {
  await db.delete(acceptedAnswers).where(eq(acceptedAnswers.learningItemId, learningItemId));
  if (answers.length === 0) return;
  await db.insert(acceptedAnswers).values(
    answers.map((answer) => ({
      learningItemId,
      side: answer.side,
      value: answer.value,
      normalizedValue: normalizeForComparison(answer.value),
    })),
  );
}

export type CreateLearningItemFields =
  | { type: "vocabulary"; fields: VocabularyFieldsInput }
  | { type: "grammar"; fields: GrammarFieldsInput };

/** Inserts a brand-new item at `pending` status (spec 11 rewrite's "Creating Items") — no draft involved, since there's no live version to protect yet. */
export async function createLearningItem(
  db: DbClient,
  input: CreateLearningItemFields & { languageId: string; levelId: string; position: number; lessonPriority: number },
): Promise<string> {
  const [item] = await db
    .insert(learningItems)
    .values({
      languageId: input.languageId,
      levelId: input.levelId,
      type: input.type,
      status: "pending",
      position: input.position,
      lessonPriority: input.lessonPriority,
    })
    .returning({ id: learningItems.id });
  const learningItemId = item!.id;

  if (input.type === "vocabulary") {
    const f = input.fields;
    await db.insert(vocabularyItems).values({
      learningItemId,
      vocabularyGroupId: f.vocabularyGroupId,
      term: f.term,
      primaryMeaning: f.primaryMeaning,
      definition: f.definition ?? null,
      article: f.article ?? null,
      partOfSpeech: f.partOfSpeech,
      pronunciation: f.pronunciation ?? null,
      ipa: f.ipa ?? null,
      context: f.context ?? null,
      creatorNotes: f.creatorNotes ?? null,
    });
    await replaceAcceptedAnswers(db, learningItemId, f.acceptedAnswers);
  } else {
    const f = input.fields;
    await db.insert(grammarItems).values({
      learningItemId,
      title: f.title ?? null,
      structure: f.structure,
      primaryMeaning: f.primaryMeaning,
      explanation: f.explanation,
      category: f.category ?? null,
      creatorNotes: f.creatorNotes ?? null,
      requiredQuestions: f.requiredQuestions,
    });
    await replaceAcceptedAnswers(db, learningItemId, f.acceptedAnswers);
  }

  return learningItemId;
}

/** Updates a `pending`-status item's fields directly — safe because nothing is live yet. Never call on a `published` item (use the draft path instead). */
export async function updateLearningItemDirect(db: DbClient, learningItemId: string, input: CreateLearningItemFields): Promise<void> {
  if (input.type === "vocabulary") {
    const f = input.fields;
    await db
      .update(vocabularyItems)
      .set({
        vocabularyGroupId: f.vocabularyGroupId,
        term: f.term,
        primaryMeaning: f.primaryMeaning,
        definition: f.definition ?? null,
        article: f.article ?? null,
        partOfSpeech: f.partOfSpeech,
        pronunciation: f.pronunciation ?? null,
        ipa: f.ipa ?? null,
        context: f.context ?? null,
        creatorNotes: f.creatorNotes ?? null,
      })
      .where(eq(vocabularyItems.learningItemId, learningItemId));
    await replaceAcceptedAnswers(db, learningItemId, f.acceptedAnswers);
  } else {
    const f = input.fields;
    await db
      .update(grammarItems)
      .set({
        title: f.title ?? null,
        structure: f.structure,
        primaryMeaning: f.primaryMeaning,
        explanation: f.explanation,
        category: f.category ?? null,
        creatorNotes: f.creatorNotes ?? null,
        requiredQuestions: f.requiredQuestions,
      })
      .where(eq(grammarItems.learningItemId, learningItemId));
    await replaceAcceptedAnswers(db, learningItemId, f.acceptedAnswers);
  }
}

/** Publishes a `pending` item for the first time — just a status flip plus a version bump, no draft involved. */
export async function publishPendingItem(db: DbClient, learningItemId: string): Promise<void> {
  await db
    .update(learningItems)
    .set({ status: "published", version: sql`${learningItems.version} + 1` })
    .where(eq(learningItems.id, learningItemId));
}

export type DraftData = { type: "vocabulary"; fields: VocabularyFieldsInput } | { type: "grammar"; fields: GrammarFieldsInput };

/** Creates or replaces the one allowed open draft for an already-published item (spec 11 rewrite's "Draft" status). The live rows are untouched. */
export async function saveDraft(
  db: DbClient,
  input: { learningItemId: string; baseVersion: number; createdBy: string; data: DraftData },
): Promise<void> {
  await db
    .insert(curriculumItemDrafts)
    .values({
      learningItemId: input.learningItemId,
      baseVersion: input.baseVersion,
      data: input.data,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: curriculumItemDrafts.learningItemId,
      set: { data: input.data, updatedAt: new Date() },
    });
}

export type Draft = { id: string; baseVersion: number; data: DraftData; createdBy: string };

export async function getDraft(db: DbClient, learningItemId: string): Promise<Draft | null> {
  const [row] = await db.select().from(curriculumItemDrafts).where(eq(curriculumItemDrafts.learningItemId, learningItemId)).limit(1);
  if (!row) return null;
  return { id: row.id, baseVersion: row.baseVersion, data: row.data as DraftData, createdBy: row.createdBy };
}

export async function discardDraft(db: DbClient, learningItemId: string): Promise<void> {
  await db.delete(curriculumItemDrafts).where(eq(curriculumItemDrafts.learningItemId, learningItemId));
}

/** Applies an open draft's field values onto the live rows and bumps `version` — the item's `status` stays `published` throughout, per the confirmed design (see progress-tracker.md). */
export async function publishDraft(db: DbClient, learningItemId: string, draft: DraftData): Promise<void> {
  await updateLearningItemDirect(db, learningItemId, draft);
  await db
    .update(learningItems)
    .set({ version: sql`${learningItems.version} + 1` })
    .where(eq(learningItems.id, learningItemId));
  await discardDraft(db, learningItemId);
}

/** Archives an item (spec 11 rewrite's "Archive/Delete") — discards any open draft, since an archived item has no future publish to protect. */
export async function archiveLearningItem(db: DbClient, learningItemId: string): Promise<void> {
  await discardDraft(db, learningItemId);
  await db.update(learningItems).set({ status: "archived" }).where(eq(learningItems.id, learningItemId));
}

async function runDeleteStatements(db: DbClient, learningItemId: string): Promise<void> {
  await db.delete(learningItemSentences).where(eq(learningItemSentences.learningItemId, learningItemId));
  await db.delete(acceptedAnswers).where(eq(acceptedAnswers.learningItemId, learningItemId));
  await discardDraft(db, learningItemId);
  await db.delete(vocabularyItems).where(eq(vocabularyItems.learningItemId, learningItemId));
  await db.delete(grammarItems).where(eq(grammarItems.learningItemId, learningItemId));
  await db.delete(learningItems).where(eq(learningItems.id, learningItemId));
}

/**
 * Attempts a permanent delete; returns `"referenced"` instead of throwing
 * when a `RESTRICT` foreign key blocks it (real learner progress/notes/
 * synonyms) — the database's own constraints are the source of truth for
 * "is this safe to delete," not a hand-maintained list of referencing
 * tables that could drift out of sync with the schema.
 *
 * Runs inside its own nested transaction/savepoint (`db.transaction()` —
 * a savepoint when `db` is already a transaction, per this codebase's
 * established nested-transaction precedent) rather than directly against
 * `db`. Postgres marks an entire transaction aborted the instant any
 * statement inside it errors — a caller in the middle of a larger
 * transaction (e.g. "try delete, archive instead if referenced," both in
 * one operation) would otherwise be left unable to run anything else once
 * the FK violation fired. Confirmed directly: the first version of this
 * function's own integration test failed with Postgres's `25P02` ("current
 * transaction is aborted") on the very next statement after the caught
 * violation, before this fix.
 */
export async function attemptPermanentDelete(db: DbClient, learningItemId: string): Promise<"deleted" | "referenced"> {
  try {
    await db.transaction(async (tx) => {
      await runDeleteStatements(tx, learningItemId);
    });
    return "deleted";
  } catch (error) {
    if (hasSqlState(error, RESTRICT_VIOLATION_SQLSTATES)) return "referenced";
    throw error;
  }
}

/** Moves an item to a different level and/or vocabulary group — never changes `learning_items.id` (spec 11 rewrite's "Moving Curriculum"). Appends at the end of the target level+type's ordering. */
export async function moveLearningItem(
  db: DbClient,
  input: { learningItemId: string; type: "vocabulary" | "grammar"; levelId?: string; vocabularyGroupId?: string },
): Promise<void> {
  if (input.levelId) {
    const [{ maxPosition }] = await db
      .select({ maxPosition: sql<number>`coalesce(max(${learningItems.position}), 0)` })
      .from(learningItems)
      .where(and(eq(learningItems.levelId, input.levelId), eq(learningItems.type, input.type)));
    await db
      .update(learningItems)
      .set({ levelId: input.levelId, position: maxPosition + 1 })
      .where(eq(learningItems.id, input.learningItemId));
  }
  if (input.vocabularyGroupId) {
    await db
      .update(vocabularyItems)
      .set({ vocabularyGroupId: input.vocabularyGroupId })
      .where(eq(vocabularyItems.learningItemId, input.learningItemId));
  }
}

/**
 * Reorders every item in one level+type to match `orderedLearningItemIds`
 * (spec 11 rewrite's "Curriculum Ordering"). Two-phase update — first to
 * unique negative placeholders, then to the real 1-indexed positions —
 * because `(level_id, type, position)` is uniquely constrained and a
 * straight in-place update can collide with another row's current position
 * mid-reorder (classic reordering-under-a-unique-constraint problem).
 */
export async function reorderLearningItems(db: DbClient, levelId: string, type: "vocabulary" | "grammar", orderedLearningItemIds: string[]): Promise<void> {
  for (let i = 0; i < orderedLearningItemIds.length; i++) {
    await db
      .update(learningItems)
      .set({ position: -(i + 1) })
      .where(and(eq(learningItems.id, orderedLearningItemIds[i]!), eq(learningItems.levelId, levelId), eq(learningItems.type, type)));
  }
  for (let i = 0; i < orderedLearningItemIds.length; i++) {
    await db
      .update(learningItems)
      .set({ position: i + 1 })
      .where(and(eq(learningItems.id, orderedLearningItemIds[i]!), eq(learningItems.levelId, levelId), eq(learningItems.type, type)));
  }
}

/** Same-language, same-type candidates for duplicate comparison (spec 11 rewrite's "Duplicate Detection") — `domains/curriculum/curriculum-duplicate-detection.ts` does the actual normalized matching. */
export async function getDuplicateCandidateRows(
  db: DbClient,
  languageId: string,
  type: "vocabulary" | "grammar",
  excludeLearningItemId?: string,
): Promise<{ learningItemId: string; displayForm: string; displayLabel: string; status: DuplicateCandidate["status"] }[]> {
  if (type === "vocabulary") {
    const rows = await db
      .select({
        id: learningItems.id,
        status: learningItems.status,
        term: vocabularyItems.term,
        article: vocabularyItems.article,
        primaryMeaning: vocabularyItems.primaryMeaning,
      })
      .from(learningItems)
      .innerJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
      .where(and(eq(learningItems.languageId, languageId), eq(learningItems.type, "vocabulary")));
    return rows
      .filter((row) => row.id !== excludeLearningItemId)
      .map((row) => ({
        learningItemId: row.id,
        displayForm: row.term,
        displayLabel: row.article ? `${row.article} ${row.term} (${row.primaryMeaning})` : `${row.term} (${row.primaryMeaning})`,
        status: row.status,
      }));
  }

  const rows = await db
    .select({ id: learningItems.id, status: learningItems.status, structure: grammarItems.structure, primaryMeaning: grammarItems.primaryMeaning })
    .from(learningItems)
    .innerJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .where(and(eq(learningItems.languageId, languageId), eq(learningItems.type, "grammar")));
  return rows
    .filter((row) => row.id !== excludeLearningItemId)
    .map((row) => ({
      learningItemId: row.id,
      displayForm: row.structure,
      displayLabel: `${row.structure} (${row.primaryMeaning})`,
      status: row.status,
    }));
}

/** Every accepted answer currently on file for an item, grouped by side. */
export async function getAcceptedAnswers(db: DbClient, learningItemId: string): Promise<AcceptedAnswerInput[]> {
  const rows = await db.select().from(acceptedAnswers).where(eq(acceptedAnswers.learningItemId, learningItemId));
  return rows.map((row) => ({ side: row.side, value: row.value }));
}

/** Whether any real, unbounded-list dependency (learner progress, notes, synonyms) would block a permanent delete — used to show the accurate confirmation copy before the admin even attempts it. */
export async function hasBlockingReferences(db: DbClient, learningItemId: string): Promise<boolean> {
  const result = await attemptPermanentDeleteDryRun(db, learningItemId);
  return result === "referenced";
}

async function attemptPermanentDeleteDryRun(db: DbClient, learningItemId: string): Promise<"deleted" | "referenced"> {
  // Reuses the real delete attempt inside a rolled-back savepoint, so the
  // dry run is provably accurate to what a real delete would do, rather
  // than a second, hand-maintained "does anything reference this" query
  // that could silently drift from the actual constraints. Same
  // rollback-catch shape as `db/test/with-test-transaction.ts`.
  let outcome: "deleted" | "referenced" = "deleted";
  try {
    await db.transaction(async (tx) => {
      outcome = await attemptPermanentDelete(tx, learningItemId);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  return outcome;
}

// --- Levels management (spec 11 rewrite's "Levels Management") ---

export async function createLevel(db: DbClient, input: { languageId: string; levelNumber: number; name?: string | null }): Promise<string> {
  const [row] = await db
    .insert(levels)
    .values({ languageId: input.languageId, levelNumber: input.levelNumber, name: input.name ?? null })
    .returning({ id: levels.id });
  return row!.id;
}

export async function updateLevel(db: DbClient, levelId: string, input: { name?: string | null; status?: CurriculumStatus }): Promise<void> {
  await db
    .update(levels)
    .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.status ? { status: input.status } : {}) })
    .where(eq(levels.id, levelId));
}

/** Real counts behind spec 11 rewrite's "Level 8: Vocabulary 47/48 ⚠" validation display — always derived live, never a stored/cacheable summary (architecture.md's authoritative-data rule). */
export async function getLevelValidationCounts(db: DbClient, levelId: string): Promise<LevelValidationCounts> {
  const [[vocabRow], [grammarRow], [groupRow]] = await Promise.all([
    db.select({ n: count() }).from(learningItems).where(and(eq(learningItems.levelId, levelId), eq(learningItems.type, "vocabulary"))),
    db.select({ n: count() }).from(learningItems).where(and(eq(learningItems.levelId, levelId), eq(learningItems.type, "grammar"))),
    db.select({ n: count() }).from(vocabularyGroups).where(eq(vocabularyGroups.levelId, levelId)),
  ]);
  return { vocabularyItems: vocabRow!.n, grammarItems: grammarRow!.n, vocabularyGroups: groupRow!.n };
}

// --- Vocabulary groups/themes management (spec 11 rewrite's "Vocabulary Groups / Themes") ---

export async function createVocabularyGroup(db: DbClient, input: { levelId: string; languageId: string; name: string }): Promise<string> {
  const [{ maxPosition }] = await db
    .select({ maxPosition: sql<number>`coalesce(max(${vocabularyGroups.position}), 0)` })
    .from(vocabularyGroups)
    .where(eq(vocabularyGroups.levelId, input.levelId));
  const [row] = await db
    .insert(vocabularyGroups)
    .values({ levelId: input.levelId, languageId: input.languageId, name: input.name, position: maxPosition + 1 })
    .returning({ id: vocabularyGroups.id });
  return row!.id;
}

export async function updateVocabularyGroup(db: DbClient, groupId: string, input: { name?: string; status?: CurriculumStatus }): Promise<void> {
  await db
    .update(vocabularyGroups)
    .set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.status ? { status: input.status } : {}) })
    .where(eq(vocabularyGroups.id, groupId));
}

/** Same two-phase (negative-placeholder, then final) position update as `reorderLearningItems`, for the same unique-constraint-collision reason. */
export async function reorderVocabularyGroups(db: DbClient, levelId: string, orderedGroupIds: string[]): Promise<void> {
  for (let i = 0; i < orderedGroupIds.length; i++) {
    await db.update(vocabularyGroups).set({ position: -(i + 1) }).where(and(eq(vocabularyGroups.id, orderedGroupIds[i]!), eq(vocabularyGroups.levelId, levelId)));
  }
  for (let i = 0; i < orderedGroupIds.length; i++) {
    await db.update(vocabularyGroups).set({ position: i + 1 }).where(and(eq(vocabularyGroups.id, orderedGroupIds[i]!), eq(vocabularyGroups.levelId, levelId)));
  }
}
