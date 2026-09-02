import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, levels, userLevelProgress, users } from "@/db/schema";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction, type TestTx } from "@/db/test/with-test-transaction";

import { getDefaultLanguageCode } from "./provisioning-config";
import { findUserByClerkUserId, provisionUser } from "./user-repository";

/**
 * Seeds the minimal §38 prerequisite (the configured default language and
 * its Level 1) inside the caller's own rolled-back transaction, so every
 * test using `withTestTransaction` is self-contained and order-independent.
 * The real deterministic fixture set (spec 08 §37) is Unit 4's concern —
 * this is intentionally the smallest slice Unit 3's provisioning tests need.
 */
async function seedDefaultLanguageAndLevel1(tx: TestTx) {
  const [language] = await tx
    .insert(languages)
    .values({ code: getDefaultLanguageCode(), slug: `spanish-${randomUUID()}`, name: "Spanish" })
    .returning();
  const [level1] = await tx.insert(levels).values({ languageId: language.id, levelNumber: 1 }).returning();
  return { language, level1 };
}

describe("provisionUser / findUserByClerkUserId", () => {
  it("creates exactly one internal user for a first-time identity", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      const user = await provisionUser(tx, "clerk-first-time");

      const rows = await tx.select().from(users).where(eq(users.clerkUserId, "clerk-first-time"));
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(user.id);
    });
  });

  it("returns the same internal user on repeated resolution", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      const clerkUserId = "clerk-repeat";

      async function resolve() {
        return (await findUserByClerkUserId(tx, clerkUserId)) ?? provisionUser(tx, clerkUserId);
      }

      const first = await resolve();
      const second = await resolve();
      expect(second.id).toBe(first.id);

      const rows = await tx.select().from(users).where(eq(users.clerkUserId, clerkUserId));
      expect(rows).toHaveLength(1);
    });
  });

  it("enforces clerk_user_id uniqueness for non-null values at the database level", async () => {
    await withTestTransaction(async (tx) => {
      const { language } = await seedDefaultLanguageAndLevel1(tx);
      await tx.insert(users).values({ clerkUserId: "dup-clerk", activeLanguageId: language.id });

      await expect(
        tx.insert(users).values({ clerkUserId: "dup-clerk", activeLanguageId: language.id }),
      ).rejects.toThrow();
    });
  });

  it("permits multiple sandbox users with null clerk_user_id", async () => {
    await withTestTransaction(async (tx) => {
      const { language } = await seedDefaultLanguageAndLevel1(tx);
      const [owner] = await tx
        .insert(users)
        .values({ clerkUserId: "owner-dev", role: "developer", activeLanguageId: language.id })
        .returning();
      const [sandboxA] = await tx
        .insert(users)
        .values({ isSandbox: true, sandboxOwnerUserId: owner.id, activeLanguageId: language.id })
        .returning();
      const [sandboxB] = await tx
        .insert(users)
        .values({ isSandbox: true, sandboxOwnerUserId: owner.id, activeLanguageId: language.id })
        .returning();

      expect(sandboxA.clerkUserId).toBeNull();
      expect(sandboxB.clerkUserId).toBeNull();
      expect(sandboxA.id).not.toBe(sandboxB.id);
    });
  });

  it("provisions default role, timezone, active language, and a Level 1 unlock row", async () => {
    await withTestTransaction(async (tx) => {
      const { language, level1 } = await seedDefaultLanguageAndLevel1(tx);
      const user = await provisionUser(tx, "clerk-defaults");

      expect(user.role).toBe("user");
      expect(user.timezone).toBe("UTC");
      expect(user.activeLanguageId).toBe(language.id);

      const [unlock] = await tx
        .select()
        .from(userLevelProgress)
        .where(and(eq(userLevelProgress.userId, user.id), eq(userLevelProgress.levelId, level1.id)));
      expect(unlock).toBeDefined();
      expect(unlock.unlockedAt).toBeInstanceOf(Date);
    });
  });

  it("fails provisioning cleanly when the configured default language does not exist", async () => {
    await withTestTransaction(async (tx) => {
      // Deliberately does not seed the default language fixture.
      await expect(provisionUser(tx, "clerk-no-language")).rejects.toThrow(
        expect.objectContaining({ code: "PROVISIONING_FAILED" }),
      );

      const rows = await tx.select().from(users).where(eq(users.clerkUserId, "clerk-no-language"));
      expect(rows).toHaveLength(0);
    });
  });

  it("never leaves a half-provisioned user behind when a later statement in the same transaction fails", async () => {
    await withTestTransaction(async (tx) => {
      const { language } = await seedDefaultLanguageAndLevel1(tx);
      const clerkUserId = "clerk-half-provisioned";

      // Reproduces provisionUser's own atomicity mechanism directly: insert
      // the user row, then force a real constraint violation later in the
      // *same* nested transaction (a level_id that doesn't exist violates
      // the user_level_progress -> levels foreign key). provisionUser
      // relies on exactly this "insert user, insert level-unlock, single
      // transaction" shape (see user-repository.ts) — if a failure here
      // didn't roll back the user insert too, a real caller could end up
      // with a user row and no starting state.
      await expect(
        tx.transaction(async (inner) => {
          const [user] = await inner
            .insert(users)
            .values({ clerkUserId, activeLanguageId: language.id })
            .returning();
          await inner.insert(userLevelProgress).values({
            userId: user.id,
            levelId: "00000000-0000-0000-0000-000000000000",
            unlockedAt: new Date(),
          });
        }),
      ).rejects.toThrow();

      const rows = await tx.select().from(users).where(eq(users.clerkUserId, clerkUserId));
      expect(rows).toHaveLength(0);
    });
  });

  it("returns the current database role authoritatively, reflecting any DB-side change", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      const user = await provisionUser(tx, "clerk-role-auth");
      expect(user.role).toBe("user");

      await tx.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
      const refetched = await findUserByClerkUserId(tx, "clerk-role-auth");
      expect(refetched?.role).toBe("admin");
    });
  });

  it("cannot have its role influenced by claimed external identity metadata", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      // Simulates a Clerk identity whose public metadata claims "admin" —
      // resolveCurrentUser (user-service.ts) and this repository only ever
      // pass the bare clerk user id through; there is no parameter through
      // which a claimed role could reach provisioning.
      const claimedIdentity = { id: "clerk-untrusted", publicMetadata: { role: "admin" as const } };
      const user = await provisionUser(tx, claimedIdentity.id);
      expect(user.role).toBe("user");
    });
  });
});

describe("provisionUser concurrency (real, independently-committed transactions)", () => {
  it(
    "cannot create duplicate users or duplicate Level 1 unlocks under concurrent provisioning",
    async () => {
      const languageCode = getDefaultLanguageCode();
      const clerkUserId = `clerk-concurrent-${randomUUID()}`;

      // Real concurrency requires two independent, genuinely concurrent
      // transactions — the rolled-back single-transaction harness every
      // other test in this file uses can't produce that. The language/
      // Level 1 rows seeded here are the same ones the real app needs for
      // provisioning to work at all (spec 08 §38), so they're deliberately
      // left committed (idempotent via onConflictDoNothing) rather than
      // cleaned up; only this test's own clerkUserId-scoped rows are
      // cleaned up afterward.
      const [insertedLanguage] = await testDb
        .insert(languages)
        .values({ code: languageCode, slug: "spanish", name: "Spanish" })
        .onConflictDoNothing({ target: languages.code })
        .returning();
      const language =
        insertedLanguage ??
        (await testDb.select().from(languages).where(eq(languages.code, languageCode)).limit(1))[0];

      const [insertedLevel1] = await testDb
        .insert(levels)
        .values({ languageId: language.id, levelNumber: 1 })
        .onConflictDoNothing({ target: [levels.languageId, levels.levelNumber] })
        .returning();
      const level1 =
        insertedLevel1 ??
        (
          await testDb
            .select()
            .from(levels)
            .where(and(eq(levels.languageId, language.id), eq(levels.levelNumber, 1)))
            .limit(1)
        )[0];

      try {
        const [userA, userB] = await Promise.all([
          provisionUser(testDb, clerkUserId),
          provisionUser(testDb, clerkUserId),
        ]);
        expect(userA.id).toBe(userB.id);

        const userRows = await testDb.select().from(users).where(eq(users.clerkUserId, clerkUserId));
        expect(userRows).toHaveLength(1);

        const unlockRows = await testDb
          .select()
          .from(userLevelProgress)
          .where(and(eq(userLevelProgress.userId, userA.id), eq(userLevelProgress.levelId, level1.id)));
        expect(unlockRows).toHaveLength(1);
      } finally {
        const [maybeUser] = await testDb.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
        if (maybeUser) {
          await testDb.delete(userLevelProgress).where(eq(userLevelProgress.userId, maybeUser.id));
          await testDb.delete(users).where(eq(users.id, maybeUser.id));
        }
      }
    },
    15_000,
  );
});
