import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { getSandboxTimeOffset } from "@/domains/users/user-clock";
import { learningItems, levels, userItemProgress, userLevelProgress, users, vocabularyItems, grammarItems } from "@/db/schema";
import { unlockLevel } from "@/domains/progress/repository";
import type { SrsStage } from "@/domains/srs";

import type { SandboxAccount, SandboxItemState, SandboxLevelState, SandboxSnapshot } from "./sandbox-types";

/**
 * Sandbox persistence (spec 11 rewrite's "Developer Sandbox"). Reuses
 * `domains/progress`'s repository functions directly wherever they already
 * do what's needed (`unlockLevel`) — a cross-domain repository-to-
 * repository call, the same established pattern `domains/admin` already
 * uses against `domains/curriculum` (see progress-tracker.md's Architecture
 * Decisions).
 */

export async function findSandboxByOwner(db: DbClient, ownerUserId: string): Promise<SandboxAccount | null> {
  const [row] = await db
    .select({ id: users.id, activeLanguageId: users.activeLanguageId })
    .from(users)
    .where(and(eq(users.sandboxOwnerUserId, ownerUserId), eq(users.isSandbox, true)))
    .limit(1);
  return row ? { sandboxUserId: row.id, ownerUserId, languageId: row.activeLanguageId } : null;
}

/** One sandbox per owner (spec's "the current owner's sandbox state", singular) — created on first visit, matching `provisionUser`'s own on-demand pattern. Starts with Level 1 unlocked, the same starting state a real new user gets. */
export async function createSandboxForOwner(db: DbClient, { ownerUserId, languageId, level1Id }: { ownerUserId: string; languageId: string; level1Id: string }): Promise<SandboxAccount> {
  const [row] = await db
    .insert(users)
    .values({ isSandbox: true, sandboxOwnerUserId: ownerUserId, activeLanguageId: languageId })
    .returning({ id: users.id });
  const sandboxUserId = row!.id;
  await unlockLevel(db, { userId: sandboxUserId, levelId: level1Id, now: new Date() });
  return { sandboxUserId, ownerUserId, languageId };
}

export async function simulateLevel(db: DbClient, { sandboxUserId, levelId }: { sandboxUserId: string; levelId: string }): Promise<void> {
  await unlockLevel(db, { userId: sandboxUserId, levelId, now: new Date() });
}

/**
 * Sets an item's SRS stage directly — never through `applyItemProgressUpdate`
 * (that function's counters/version semantics are for a real review's
 * outcome, not an admin override). Upserts: the item may not have any
 * progress row yet if the sandbox never actually reviewed it for real.
 * `nextReviewAt` is left untouched on an existing row and `null` on a new
 * one — "set the stage" and "make it due" are two separate controls in the
 * spec's own mockup, so this never forces a due date as a side effect.
 */
export async function setItemSrsStage(
  db: DbClient,
  { sandboxUserId, learningItemId, languageId, srsStage }: { sandboxUserId: string; learningItemId: string; languageId: string; srsStage: SrsStage },
): Promise<void> {
  await db
    .insert(userItemProgress)
    .values({ userId: sandboxUserId, learningItemId, languageId, srsStage, learnedAt: new Date() })
    .onConflictDoUpdate({
      target: [userItemProgress.userId, userItemProgress.learningItemId],
      set: { srsStage },
    });
}

/** Forces every one of the sandbox's currently-enrolled items due right now — the spec's single "Reviews [Make Due]" control, not scoped to one item. */
export async function makeAllReviewsDue(db: DbClient, sandboxUserId: string): Promise<void> {
  await db.update(userItemProgress).set({ nextReviewAt: new Date() }).where(eq(userItemProgress.userId, sandboxUserId));
}

/** Clears only this sandbox's own progress, then re-establishes the Level 1 starting state — never touches another sandbox or any real learner (spec's "Reset clears only the current owner's sandbox state"). */
export async function resetSandbox(db: DbClient, { sandboxUserId, level1Id }: { sandboxUserId: string; level1Id: string }): Promise<void> {
  await db.delete(userItemProgress).where(eq(userItemProgress.userId, sandboxUserId));
  await db.delete(userLevelProgress).where(eq(userLevelProgress.userId, sandboxUserId));
  await unlockLevel(db, { userId: sandboxUserId, levelId: level1Id, now: new Date() });
}

export async function getSandboxSnapshot(db: DbClient, account: SandboxAccount): Promise<SandboxSnapshot> {
  const [levelRows, itemRows] = await Promise.all([
    db
      .select({ levelId: levels.id, levelNumber: levels.levelNumber, levelName: levels.name, unlockedAt: userLevelProgress.unlockedAt })
      .from(userLevelProgress)
      .innerJoin(levels, eq(levels.id, userLevelProgress.levelId))
      .where(eq(userLevelProgress.userId, account.sandboxUserId))
      .orderBy(levels.levelNumber),
    db
      .select({
        learningItemId: learningItems.id,
        levelNumber: levels.levelNumber,
        srsStage: userItemProgress.srsStage,
        nextReviewAt: userItemProgress.nextReviewAt,
        vocabTerm: vocabularyItems.term,
        grammarStructure: grammarItems.structure,
      })
      .from(userItemProgress)
      .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
      .innerJoin(levels, eq(levels.id, learningItems.levelId))
      .leftJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
      .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
      .where(eq(userItemProgress.userId, account.sandboxUserId))
      .orderBy(levels.levelNumber),
  ]);

  const unlockedLevels: SandboxLevelState[] = levelRows.map((row) => ({
    levelId: row.levelId,
    levelNumber: row.levelNumber,
    levelName: row.levelName,
    unlockedAt: row.unlockedAt,
  }));

  const items: SandboxItemState[] = itemRows.map((row) => ({
    learningItemId: row.learningItemId,
    itemLabel: row.vocabTerm ?? row.grammarStructure ?? "—",
    levelNumber: row.levelNumber,
    srsStage: row.srsStage,
    nextReviewAt: row.nextReviewAt,
  }));

  const timeOffsetSeconds = await getSandboxTimeOffset(db, account.sandboxUserId);

  return { account, unlockedLevels, items, timeOffsetSeconds };
}
