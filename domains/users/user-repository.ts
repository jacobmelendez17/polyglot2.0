import { and, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { languages, levels, users, userLevelProgress } from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";

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
