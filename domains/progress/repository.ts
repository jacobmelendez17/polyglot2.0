import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { learningItems, levels, userItemProgress, userLevelProgress } from "@/db/schema";
import { calculateFluentMaintenanceReview } from "@/domains/srs";
import type { SrsStage } from "@/domains/srs";

import type { ItemProgress, LevelProgress } from "./types";

/**
 * Real progress repository (spec 08 §29) — read-oriented only. No
 * `setSrsStage`/`setNextReview`/`setUnlocked` mutation API is exposed here
 * deliberately; authoritative mutations belong to future, approved
 * lesson/review workflows, not general-purpose repository setters. Every
 * function is user-scoped by a required `userId` parameter — a query that
 * could return another user's row when called correctly would be a defect,
 * not a caller-discipline concern (spec §29's own framing).
 *
 * Takes an injected `DbClient`, not the `db` singleton — see
 * `domains/users/user-repository.ts` for why.
 */

type ItemProgressRow = typeof userItemProgress.$inferSelect;
type LevelProgressRow = typeof userLevelProgress.$inferSelect;

function toItemProgress(row: ItemProgressRow): ItemProgress {
  return {
    userId: row.userId,
    learningItemId: row.learningItemId,
    languageId: row.languageId,
    srsStage: row.srsStage,
    learnedAt: row.learnedAt,
    nextReviewAt: row.nextReviewAt,
    fluentAt: row.fluentAt,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    reviewCount: row.reviewCount,
    lastReviewedAt: row.lastReviewedAt,
    version: row.version,
  };
}

function toLevelProgress(row: LevelProgressRow): LevelProgress {
  return { userId: row.userId, levelId: row.levelId, unlockedAt: row.unlockedAt, completedAt: row.completedAt };
}

export async function getItemProgress(
  db: DbClient,
  userId: string,
  learningItemId: string,
): Promise<ItemProgress | null> {
  const [row] = await db
    .select()
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.learningItemId, learningItemId)))
    .limit(1);
  return row ? toItemProgress(row) : null;
}

export async function hasItemProgress(db: DbClient, userId: string, learningItemId: string): Promise<boolean> {
  return (await getItemProgress(db, userId, learningItemId)) !== null;
}

/** Every progress row a user has in one language — the shape the due-review index (`db/schema/progress.ts`) is built for. */
export async function getUserProgressForLanguage(
  db: DbClient,
  userId: string,
  languageId: string,
): Promise<ItemProgress[]> {
  const rows = await db
    .select()
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.languageId, languageId)));
  return rows.map(toItemProgress);
}

/** Items due for review now or earlier, for one user/language — exercises `user_item_progress_due_review_idx`. Items with no scheduled review (`nextReviewAt` null, e.g. Fluent) are never due. */
export async function getDueReviewItems(
  db: DbClient,
  userId: string,
  languageId: string,
  now: Date,
): Promise<ItemProgress[]> {
  const rows = await db
    .select()
    .from(userItemProgress)
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(userItemProgress.languageId, languageId),
        lte(userItemProgress.nextReviewAt, now),
      ),
    );
  return rows.map(toItemProgress);
}

/**
 * Applies spec 20's Vacation Scheduling rule to every one of a user's
 * scheduled reviews, in one statement — the SQL expression of
 * `domains/srs`'s `calculateVacationAdjustedReview` (see that function's
 * docstring for the full derivation; `applyVacationSchedulingAdjustment.
 * integration.test.ts` proves the two stay in agreement row-for-row rather
 * than trusting them to match by inspection).
 *
 * A single `UPDATE ... CASE` rather than one call per row: a learner's
 * scheduled-review count can be in the thousands, and this must be called
 * from inside the same transaction that closes the vacation period —
 * `code-standards.md`'s "avoid N+1" applies as much to a rare action as a
 * hot path once the row count is unbounded.
 *
 * Account-wide, not language-scoped — spec 20: Vacation Mode "applies to
 * the learner's entire account, not only the active language." Items with
 * `next_review_at IS NULL` (Fluent, with no maintenance schedule) are
 * excluded — there is nothing to freeze.
 */
export async function applyVacationSchedulingAdjustment(
  db: DbClient,
  userId: string,
  vacationStartedAt: Date,
  vacationEndedAt: Date,
): Promise<void> {
  const waitStartedAt = sql`COALESCE(${userItemProgress.lastReviewedAt}, ${userItemProgress.learnedAt})`;

  await db
    .update(userItemProgress)
    .set({
      nextReviewAt: sql`CASE
        WHEN ${waitStartedAt} <= ${vacationStartedAt}
          THEN ${userItemProgress.nextReviewAt} + (${vacationEndedAt}::timestamptz - ${vacationStartedAt}::timestamptz)
        ELSE ${vacationEndedAt}::timestamptz + (${userItemProgress.nextReviewAt} - ${waitStartedAt})
      END`,
    })
    .where(and(eq(userItemProgress.userId, userId), isNotNull(userItemProgress.nextReviewAt)));
}

/**
 * Earliest upcoming review time, strictly after `now` — spec 13's dashboard
 * "Reviews" card shows this when nothing is currently due. Exercises the
 * same `user_item_progress_due_review_idx` leftmost prefix as
 * `getDueReviewItems`, just ordered instead of filtered to `<= now`.
 */
export async function getNextUpcomingReviewAt(db: DbClient, userId: string, languageId: string, now: Date): Promise<Date | null> {
  const [row] = await db
    .select({ nextReviewAt: userItemProgress.nextReviewAt })
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.languageId, languageId), gt(userItemProgress.nextReviewAt, now)))
    .orderBy(asc(userItemProgress.nextReviewAt))
    .limit(1);
  return row?.nextReviewAt ?? null;
}

export type UpcomingReviewForecastItem = {
  nextReviewAt: Date;
  itemType: "vocabulary" | "grammar";
};

/**
 * Items becoming due strictly between `after` and `until` — project-overview.md's
 * "upcoming review forecast bar graph." Deliberately excludes anything
 * already due (`nextReviewAt <= after`, typically `now`) so this never
 * double-counts against `getDueReviewItems`. Bounded by the caller's window
 * (the dashboard never asks further than 7 days out), using the same
 * indexed `(user_id, language_id, next_review_at)` prefix.
 */
export async function getUpcomingReviewForecast(
  db: DbClient,
  userId: string,
  languageId: string,
  { after, until }: { after: Date; until: Date },
): Promise<UpcomingReviewForecastItem[]> {
  const rows = await db
    .select({ nextReviewAt: userItemProgress.nextReviewAt, itemType: learningItems.type })
    .from(userItemProgress)
    .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(userItemProgress.languageId, languageId),
        gt(userItemProgress.nextReviewAt, after),
        lte(userItemProgress.nextReviewAt, until),
      ),
    );
  // The `gt(nextReviewAt, after)` filter above already guarantees every
  // matching row's `nextReviewAt` is non-null (SQL comparison against NULL
  // is never true) — Drizzle's inferred column type just can't express that.
  return rows.map((row) => ({ nextReviewAt: row.nextReviewAt as Date, itemType: row.itemType }));
}

/**
 * How many of the given learning items the user has any progress row for —
 * the dashboard's per-level "learned" count (spec 13). Bounded by
 * `learningItemIds.length`, the level's own real item count (tens, not an
 * unbounded scan), and served by the primary key's `user_id` leftmost
 * prefix.
 */
export async function countProgressForItems(db: DbClient, userId: string, learningItemIds: string[]): Promise<number> {
  if (learningItemIds.length === 0) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), inArray(userItemProgress.learningItemId, learningItemIds)));
  return row?.value ?? 0;
}

export async function getLevelProgress(db: DbClient, userId: string, levelId: string): Promise<LevelProgress | null> {
  const [row] = await db
    .select()
    .from(userLevelProgress)
    .where(and(eq(userLevelProgress.userId, userId), eq(userLevelProgress.levelId, levelId)))
    .limit(1);
  return row ? toLevelProgress(row) : null;
}

/** Every level a user has unlocked in one language — joins through `levels` since `user_level_progress` has no denormalized `language_id`. */
export async function getUnlockedLevels(db: DbClient, userId: string, languageId: string): Promise<LevelProgress[]> {
  const rows = await db
    .select({ progress: userLevelProgress })
    .from(userLevelProgress)
    .innerJoin(levels, eq(levels.id, userLevelProgress.levelId))
    .where(and(eq(userLevelProgress.userId, userId), eq(levels.languageId, languageId)));
  return rows.map((row) => toLevelProgress(row.progress));
}

/**
 * The following mutation functions exist for real, approved review/lesson
 * completion workflows only (spec 09 unit 4 is the first) — this repository
 * was deliberately read-only until now (see this file's top docstring).
 * They take an injected `DbClient` like every function above; a caller that
 * needs them composed into one atomic transaction with other domains'
 * writes (spec 09 §10 — review-event insertion, idempotency, level unlock,
 * all-or-nothing) passes the same `tx` to each.
 */

/**
 * Locks the row for the duration of the caller's transaction (`SELECT ...
 * FOR UPDATE`) so a concurrent completion of the same item serializes
 * behind this one rather than racing it (spec 09 §11's "use database-level
 * row locking"). Returns `null` if no such row exists, or if it exists but
 * belongs to a different language than expected (spec 09 §10's "validate
 * ownership + language") — both are treated as not-found by the caller.
 * Does **not** itself decide staleness or due-ness — comparing the locked
 * row against the caller's review-session snapshot is spec 09's own
 * business logic (`STALE_REVIEW`/`REVIEW_NOT_DUE`), not a generic
 * progress-repository concern.
 */
export async function lockItemProgressForReview(
  db: DbClient,
  { userId, learningItemId, languageId }: { userId: string; learningItemId: string; languageId: string },
): Promise<ItemProgress | null> {
  const [row] = await db
    .select()
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.learningItemId, learningItemId)))
    .for("update");

  if (!row || row.languageId !== languageId) return null;
  return toItemProgress(row);
}

export type ApplyItemProgressUpdateInput = {
  userId: string;
  learningItemId: string;
  /** Must match the row's current `version` (re-checked here as a final defensive guard on top of the row lock) — a mismatch means it changed between the lock and this call and updates zero rows. */
  expectedVersion: number;
  srsStage: SrsStage;
  nextReviewAt: Date | null;
  /** Pass the row's own current `fluentAt` to preserve it, or `now` only on the call that first reaches Fluent — this function never invents that decision itself. */
  fluentAt: Date | null;
  /** Whether this review's overall result was "advanced" or "penalized" — drives which aggregate counter increments. */
  result: "advanced" | "penalized";
  now: Date;
};

/**
 * Applies one review's outcome to the already-locked row (call after
 * `lockItemProgressForReview` inside the same transaction). Returns `null`
 * if `expectedVersion` no longer matches — should not happen given the row
 * lock, but kept as a defensive guard rather than trusting the lock alone.
 */
export async function applyItemProgressUpdate(
  db: DbClient,
  input: ApplyItemProgressUpdateInput,
): Promise<ItemProgress | null> {
  const [updated] = await db
    .update(userItemProgress)
    .set({
      srsStage: input.srsStage,
      nextReviewAt: input.nextReviewAt,
      fluentAt: input.fluentAt,
      // Only the counter matching this review's actual result increments —
      // the other is omitted entirely (not "set to itself") so it's simply
      // left untouched by this UPDATE.
      ...(input.result === "advanced"
        ? { correctCount: sql`${userItemProgress.correctCount} + 1` }
        : { incorrectCount: sql`${userItemProgress.incorrectCount} + 1` }),
      reviewCount: sql`${userItemProgress.reviewCount} + 1`,
      lastReviewedAt: input.now,
      version: sql`${userItemProgress.version} + 1`,
    })
    .where(
      and(
        eq(userItemProgress.userId, input.userId),
        eq(userItemProgress.learningItemId, input.learningItemId),
        eq(userItemProgress.version, input.expectedVersion),
      ),
    )
    .returning();

  return updated ? toItemProgress(updated) : null;
}

/**
 * The denominator for the level-unlock ratio (spec 09 §15, architecture.md's
 * "Use the actual configured number of SRS-gating items" — never a
 * hardcoded 50). Every `learning_items` row is an SRS-gating item today
 * (only vocabulary/grammar types exist); this will need to exclude a future
 * "intermission" type once one exists, per architecture.md's "Intermissions
 * are not SRS gating items."
 *
 * **Published items only** (fixed 2026-09-09, while importing the real Level
 * 1 curriculum in spec 16). This counted every row regardless of status,
 * which made a level permanently un-unlockable the moment unpublished
 * curriculum was staged in it: a learner cannot be taught a `pending` or
 * `archived` item, so counting one in the denominator asks them to reach a
 * ratio no amount of study can reach. Real Level 1 staged 57 pending items
 * behind 4 published ones and the ratio dropped to 4/62 overnight.
 *
 * No new index needed: `learning_items_level_type_position_key`'s leftmost
 * column is already `level_id`.
 */
export async function countLevelGatingItems(db: DbClient, levelId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(learningItems)
    .where(and(eq(learningItems.levelId, levelId), eq(learningItems.status, "published")));
  return row?.value ?? 0;
}

/**
 * The numerator: how many of a user's progress rows for items in this
 * level are at or above the unlock threshold stage. `qualifyingStages` is
 * computed by the caller from `SRS_STAGE_ORDER` (never a raw stage-ordinal
 * SQL comparison — architecture.md's invariant).
 *
 * No new index needed: `user_item_progress`'s primary key is already
 * `(user_id, learning_item_id)`, the exact shape this join probes (fixed
 * `user_id`, ranging `learning_item_id` from the level's items).
 */
export async function countUserItemsAtOrAboveStageInLevel(
  db: DbClient,
  { userId, levelId, qualifyingStages }: { userId: string; levelId: string; qualifyingStages: SrsStage[] },
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userItemProgress)
    .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(learningItems.levelId, levelId),
        inArray(userItemProgress.srsStage, qualifyingStages),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Idempotently persists a level unlock (spec 09 §15 — "make the operation
 * idempotent," "keep the level permanently unlocked afterward"). Safe to
 * call every time the threshold check passes, even if already unlocked —
 * `onConflictDoNothing` plus a reselect, same pattern as
 * `domains/users/user-repository.ts`'s `provisionUser`.
 */
export async function unlockLevel(
  db: DbClient,
  { userId, levelId, now }: { userId: string; levelId: string; now: Date },
): Promise<LevelProgress> {
  await db
    .insert(userLevelProgress)
    .values({ userId, levelId, unlockedAt: now })
    .onConflictDoNothing({ target: [userLevelProgress.userId, userLevelProgress.levelId] });

  const [row] = await db
    .select()
    .from(userLevelProgress)
    .where(and(eq(userLevelProgress.userId, userId), eq(userLevelProgress.levelId, levelId)))
    .limit(1);
  if (!row) {
    throw new Error(`unlockLevel: row for user ${userId} / level ${levelId} missing immediately after upsert — should never happen.`);
  }
  return toLevelProgress(row);
}

/**
 * Clears every tracked item and unlocked level for a real account, then
 * re-unlocks Level 1 — same shape as `domains/sandbox`'s `resetSandbox`,
 * but for a real user's own progress rather than an isolated sandbox
 * persona (architecture.md: "An admin may explicitly request a progress
 * reset... it must never occur silently" — the caller is responsible for
 * the confirmation and audit logging this implies; this function only does
 * the deletion). `review_events` is deliberately left untouched, matching
 * the sandbox reset's own precedent — it's a durable history log, not
 * current-state, and reset doesn't rewrite history.
 */
export async function resetAccountProgress(db: DbClient, { userId, level1Id }: { userId: string; level1Id: string }): Promise<void> {
  await db.delete(userItemProgress).where(eq(userItemProgress.userId, userId));
  await db.delete(userLevelProgress).where(eq(userLevelProgress.userId, userId));
  await unlockLevel(db, { userId, levelId: level1Id, now: new Date() });
}

export type EnrollLearningItemInput = {
  learningItemId: string;
  languageId: string;
  srsStage: SrsStage;
  learnedAt: Date;
  nextReviewAt: Date | null;
};

/**
 * Creates progress rows for a freshly completed lesson batch (spec 07 §45,
 * §46). One multi-row insert, so the batch is genuinely all-or-nothing at the
 * statement level as well as inside the caller's transaction.
 *
 * `onConflictDoNothing` is deliberately **absent**: a conflict here means an
 * item in this batch is already enrolled, which spec 07 §44 requires be
 * rejected outright rather than silently skipped. The caller checks for that
 * first and returns `LESSON_ALREADY_ENROLLED`; the primary key on
 * `(user_id, learning_item_id)` is the backstop if two completions race past
 * that check, and a raised constraint violation correctly rolls the whole
 * transaction back.
 */
export async function enrollLearningItems(
  db: DbClient,
  userId: string,
  items: EnrollLearningItemInput[],
): Promise<ItemProgress[]> {
  if (items.length === 0) return [];
  const rows = await db
    .insert(userItemProgress)
    .values(
      items.map((item) => ({
        userId,
        learningItemId: item.learningItemId,
        languageId: item.languageId,
        srsStage: item.srsStage,
        learnedAt: item.learnedAt,
        nextReviewAt: item.nextReviewAt,
      })),
    )
    .returning();
  return rows.map(toItemProgress);
}

/**
 * Spec 20 Fluent Mode's own cascading effect of toggling the setting —
 * called from inside the same transaction as the preference write
 * (`domains/srs/review-service.ts`'s `updateGrammarFluentMode`/
 * `updateVocabularyFluentMode`), never independently, so the two commit
 * together or not at all.
 *
 * **Enabling**: every Fluent-stage item of this content type stuck terminal
 * (`next_review_at IS NULL`) — whether because it reached Fluent before
 * Fluent Mode's maintenance loop existed, or because the learner had this
 * off when it got there — receives a maintenance schedule anchored to its
 * own `fluent_at`, never to `now` (spec's own explicit contrast: "Use
 * fluentAt + 6 calendar months. Do not use settingChangedAt + 6 months" —
 * if that date is already in the past, the item is simply due immediately,
 * which needs no special-casing here since `isReviewDue` already treats any
 * past `next_review_at` as due).
 *
 * **Disabling**: every Fluent-stage item with a live schedule goes back to
 * terminal (`next_review_at = NULL`) — unambiguously "only scheduled
 * because of Fluent maintenance," since no other path ever gives a
 * Fluent-stage row a non-null `next_review_at` (`srs-config.ts`'s interval
 * tables resolve every mode's `fluent` entry to `null`). A plain non-Fluent
 * scheduled review is untouched by construction, since both branches filter
 * to `srs_stage = 'fluent'`.
 *
 * Naturally idempotent — re-running either branch touches only rows
 * matching its own `next_review_at IS NULL`/`IS NOT NULL` filter, so a
 * repeated call (or the same toggle value saved twice) makes zero further
 * changes.
 *
 * Fetch-then-update rather than one bulk `UPDATE ... CASE` — unlike
 * `applyVacationSchedulingAdjustment`'s account-wide, potentially
 * thousands-of-rows adjustment, this only ever touches one learner's
 * Fluent-stage items in one content type of one language: a small, bounded
 * set for a rare settings action, not a hot path "avoid N+1" applies to.
 * Also lets the calendar-month math reuse `calculateFluentMaintenanceReview`
 * directly, rather than duplicating it as a raw SQL `interval` expression —
 * Postgres's own `timestamp + interval 'N months'` clamps at a short month's
 * end (Jan 31 + 1 month = Feb 28) where this codebase's JS-based calendar
 * arithmetic overflows into the next month instead (Jan 31 + 1 month = Mar
 * 3), so mixing the two would silently disagree with every other Fluent/SRS
 * Interval date in the app depending on which code path computed it.
 */
export async function reconcileFluentSchedules(
  db: DbClient,
  { userId, languageId, itemType, fluentModeEnabled }: { userId: string; languageId: string; itemType: "grammar" | "vocabulary"; fluentModeEnabled: boolean },
): Promise<void> {
  const rows = await db
    .select({ learningItemId: userItemProgress.learningItemId, fluentAt: userItemProgress.fluentAt })
    .from(userItemProgress)
    .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(userItemProgress.languageId, languageId),
        eq(learningItems.type, itemType),
        eq(userItemProgress.srsStage, "fluent"),
        fluentModeEnabled ? isNull(userItemProgress.nextReviewAt) : isNotNull(userItemProgress.nextReviewAt),
      ),
    );

  if (rows.length === 0) return;

  if (!fluentModeEnabled) {
    await db
      .update(userItemProgress)
      .set({ nextReviewAt: null })
      .where(and(eq(userItemProgress.userId, userId), inArray(userItemProgress.learningItemId, rows.map((row) => row.learningItemId))));
    return;
  }

  for (const row of rows) {
    // Defensive only — unreachable by construction: a row can only reach
    // `srs_stage = 'fluent'` via `review-completion.ts`, which always sets
    // `fluent_at` in the same update that first sets the stage to Fluent.
    if (!row.fluentAt) continue;
    await db
      .update(userItemProgress)
      .set({ nextReviewAt: calculateFluentMaintenanceReview(row.fluentAt) })
      .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.learningItemId, row.learningItemId)));
  }
}
