import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { languages, levels, userLanguageSettings, users, userLevelProgress } from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";

import type { CurriculumMode, LanguageSettings } from "./curriculum-preference";
import { getDefaultLanguageCode } from "./provisioning-config";
import type { PolyglotUser } from "./user-types";

/**
 * Takes the database/transaction handle as a parameter rather than
 * importing the app's `db` singleton from `db/client.ts` directly. That
 * module carries a `server-only` guard (a genuine runtime secret boundary —
 * it holds the real Neon connection), which unconditionally throws outside
 * Next's webpack build (including under Vitest — confirmed while wiring up
 * this domain's tests). Injecting the client instead lets integration
 * tests call these exact functions against a real, rolled-back test
 * transaction (spec 08 §57, §62) without ever touching that boundary; only
 * `user-service.ts` imports the real `db` value, at the one place it's
 * actually needed.
 */

type UserRow = typeof users.$inferSelect;

function toPolyglotUser(row: UserRow): PolyglotUser {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    role: row.role,
    displayName: row.displayName,
    timezone: row.timezone,
    activeLanguageId: row.activeLanguageId,
    isSandbox: row.isSandbox,
    sandboxOwnerUserId: row.sandboxOwnerUserId,
    onboardingCompletedAt: row.onboardingCompletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findUserByClerkUserId(db: DbClient, clerkUserId: string): Promise<PolyglotUser | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return row ? toPolyglotUser(row) : null;
}

export async function findUserById(db: DbClient, id: string): Promise<PolyglotUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toPolyglotUser(row) : null;
}

/** Batched, not per-row (architecture.md's N+1 rule) — the Audit log's own read model resolves a whole page of actor IDs to display names in one query. */
/**
 * Marks onboarding complete (spec 15). Idempotent by construction: the
 * `IS NULL` guard means a second call — a double-clicked "Start Now!", a
 * replayed request, two tabs — writes nothing and cannot move an already
 * recorded completion time. That is why this needs no idempotency key; the
 * conditional update *is* the idempotency.
 *
 * Returns the row as it stands afterwards, so a caller always sees the
 * authoritative state rather than assuming its own write landed.
 */
export async function completeOnboarding(db: DbClient, userId: string, now: Date): Promise<PolyglotUser | null> {
  await db
    .update(users)
    .set({ onboardingCompletedAt: now })
    .where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));
  return findUserById(db, userId);
}


/**
 * This learner's settings for one language, or `null` when they have never
 * chosen — the distinction the curriculum preference screen exists for, so
 * it is preserved rather than collapsed into a default row (spec 16).
 */
export async function findLanguageSettings(db: DbClient, userId: string, languageId: string): Promise<LanguageSettings | null> {
  const [row] = await db
    .select({
      userId: userLanguageSettings.userId,
      languageId: userLanguageSettings.languageId,
      curriculumMode: userLanguageSettings.curriculumMode,
      selectedVocabularyGroupId: userLanguageSettings.selectedVocabularyGroupId,
    })
    .from(userLanguageSettings)
    .where(and(eq(userLanguageSettings.userId, userId), eq(userLanguageSettings.languageId, languageId)))
    .limit(1);
  return row ?? null;
}

/**
 * Records the learner's curriculum mode, and the theme that goes with it in
 * Theme mode. One upsert, so choosing during onboarding and changing the
 * choice later are the same write with the same rules — there is no
 * separate "first time" path to drift.
 *
 * Any mode other than `theme` stores `null` for the selection, which is
 * both what the check constraint requires and what stops a stale theme from
 * silently reappearing if the learner switches back later. Nothing here
 * touches progress, SRS state, or unlocks: spec 16's "changing modes
 * affects future lesson generation only" holds because this row is all
 * there is to change.
 */
export async function saveCurriculumPreference(
  db: DbClient,
  input: { userId: string; languageId: string; curriculumMode: CurriculumMode; selectedVocabularyGroupId?: string | null },
): Promise<LanguageSettings> {
  const selectedVocabularyGroupId = input.curriculumMode === "theme" ? (input.selectedVocabularyGroupId ?? null) : null;

  const [row] = await db
    .insert(userLanguageSettings)
    .values({
      userId: input.userId,
      languageId: input.languageId,
      curriculumMode: input.curriculumMode,
      selectedVocabularyGroupId,
    })
    .onConflictDoUpdate({
      target: [userLanguageSettings.userId, userLanguageSettings.languageId],
      set: { curriculumMode: input.curriculumMode, selectedVocabularyGroupId, updatedAt: new Date() },
    })
    .returning({
      userId: userLanguageSettings.userId,
      languageId: userLanguageSettings.languageId,
      curriculumMode: userLanguageSettings.curriculumMode,
      selectedVocabularyGroupId: userLanguageSettings.selectedVocabularyGroupId,
    });
  return row!;
}

/**
 * Persists the Polyglot-side half of a Name change (spec 20 Account — Name).
 * The Clerk-side sync happens in `user-service.ts`'s `updateName`, which
 * calls this after; this function does not know Clerk exists.
 */
export async function updateDisplayName(db: DbClient, userId: string, displayName: string): Promise<PolyglotUser> {
  const [row] = await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  if (!row) {
    throw new AppError("ITEM_NOT_FOUND", "That account could not be found.");
  }
  return toPolyglotUser(row);
}

export async function findUsersByIds(db: DbClient, ids: string[]): Promise<PolyglotUser[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return rows.map(toPolyglotUser);
}

/**
 * Race-safe provisioning (spec 08 §10, §11). Two concurrent callers for the
 * same brand-new `clerkUserId` must not create two user rows or two Level 1
 * unlocks. Relies on the partial unique index on `clerk_user_id` as the
 * final concurrency guarantee: `ON CONFLICT ... DO NOTHING` targets that
 * exact index (its `where` clause must match the index's predicate for
 * PostgreSQL to recognize it as the conflict target), and the transaction
 * that loses the race re-reads the winner's committed row instead of
 * creating its own.
 *
 * The user row and its starting-state Level 1 unlock are created in one
 * transaction (§10) — any failure partway through (including the missing-
 * prerequisites checks below) rolls back the whole thing, so a user can
 * never be left half-provisioned.
 */
export async function provisionUser(db: DbClient, clerkUserId: string): Promise<PolyglotUser> {
  return db.transaction(async (tx) => {
    const [language] = await tx
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, getDefaultLanguageCode()))
      .limit(1);
    if (!language) {
      throw new AppError("PROVISIONING_FAILED", "The default language is not configured.");
    }

    const [level1] = await tx
      .select({ id: levels.id })
      .from(levels)
      .where(and(eq(levels.languageId, language.id), eq(levels.levelNumber, 1)))
      .limit(1);
    if (!level1) {
      throw new AppError("PROVISIONING_FAILED", "Level 1 of the default language is not configured.");
    }

    const [inserted] = await tx
      .insert(users)
      .values({
        clerkUserId,
        role: "user",
        timezone: "UTC",
        activeLanguageId: language.id,
      })
      .onConflictDoNothing({ target: users.clerkUserId, where: sql`${users.clerkUserId} IS NOT NULL` })
      .returning();

    if (inserted) {
      await tx.insert(userLevelProgress).values({
        userId: inserted.id,
        levelId: level1.id,
        unlockedAt: new Date(),
      });
      return toPolyglotUser(inserted);
    }

    // Lost the race: the winning transaction already committed a row for
    // this clerk_user_id (the conflicting insert above blocks until that
    // commit), so this read is guaranteed to find it.
    const [existing] = await tx.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
    if (!existing) {
      throw new AppError("PROVISIONING_FAILED", "User provisioning failed unexpectedly.");
    }
    return toPolyglotUser(existing);
  });
}
