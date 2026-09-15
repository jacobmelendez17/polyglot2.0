import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  decks,
  reviewEvents,
  userDismissedNotices,
  userItemProgress,
  userLanguageSettings,
  userLevelProgress,
  userNotes,
  userNotificationPreferences,
  userPreferences,
  userReviewPreferences,
  users,
  userSentenceGhostProgress,
  userStreakAdjustments,
  userSynonyms,
  userVacationPeriods,
} from "@/db/schema";

/**
 * Every table Reset Entire Account clears, one row per table here (spec
 * 20's own "Remove/reset" list, cross-checked against this codebase's real
 * schema — see `db/schema/user-settings.ts` and friends). Deliberately
 * direct `db.delete(...)`/`db.update(...)` statements against the schema
 * rather than composing ten other domains' repository functions: this is a
 * wholesale wipe with no per-domain business logic to reuse (most of those
 * repositories don't even expose a "delete everything for this user"
 * primitive, only narrow field setters), and "this is intentionally
 * broader than the existing development-only reset progress operation"
 * calls for a genuinely new, bespoke operation rather than stitching
 * together mismatched existing ones.
 *
 * `deck_items` needs no entry of its own — its foreign key to `decks`
 * cascades (`db/schema/decks.ts`), so deleting a learner's personal decks
 * removes their membership rows for free. Leech aggregate state
 * (`current_correct_streak`/`highest_srs_stage_reached`) lives on
 * `user_item_progress` itself, not a separate table, so it is cleared by
 * that same delete — spec 20's "Leech aggregate state" has no row of its
 * own to touch.
 *
 * **Not touched, deliberately:**
 * - `idempotency_keys` — an operational safety record, not learner
 *   application data; leaving it intact costs nothing and avoids any
 *   near-term idempotency-key collision immediately after a reset.
 * - Anything authored *by* this user as an admin/writer action
 *   (`curriculum_item_drafts.editedByUserId`, `curriculum_imports.
 *   importedByUserId`/`archivedByUserId`, `vocabulary_dictionary_mappings.
 *   mappedByUserId`, `vocabulary_selected_senses.selectedByUserId`,
 *   `admin_audit_events.actorUserId`) — these record what an admin *did*,
 *   not this learner's own application state, and several use `restrict`/
 *   `set null` rather than `cascade` specifically because they must
 *   survive independently of the account that made them.
 * - **"private examples"** — the spec's own list names this, but no such
 *   feature (a learner-submitted example sentence, distinct from official
 *   curriculum sentences) exists anywhere in this codebase's schema. There
 *   is nothing to delete; building a table for a feature that doesn't
 *   exist yet, only so this reset would have something to point at, would
 *   be pure scope creep this spec's own "storage only, no consumer yet"
 *   precedent (Notifications, Reset Dismissable Warnings) argues against.
 */
export async function deleteAllLearnerApplicationData(db: DbClient, userId: string): Promise<void> {
  await db.delete(reviewEvents).where(eq(reviewEvents.userId, userId));
  await db.delete(userSentenceGhostProgress).where(eq(userSentenceGhostProgress.userId, userId));
  await db.delete(userItemProgress).where(eq(userItemProgress.userId, userId));
  await db.delete(userLevelProgress).where(eq(userLevelProgress.userId, userId));
  await db.delete(userLanguageSettings).where(eq(userLanguageSettings.userId, userId));
  await db.delete(userReviewPreferences).where(eq(userReviewPreferences.userId, userId));
  await db.delete(userNotificationPreferences).where(eq(userNotificationPreferences.userId, userId));
  await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
  await db.delete(decks).where(eq(decks.ownerUserId, userId));
  await db.delete(userNotes).where(eq(userNotes.userId, userId));
  await db.delete(userSynonyms).where(eq(userSynonyms.userId, userId));
  await db.delete(userVacationPeriods).where(eq(userVacationPeriods.userId, userId));
  await db.delete(userStreakAdjustments).where(eq(userStreakAdjustments.userId, userId));
  await db.delete(userDismissedNotices).where(eq(userDismissedNotices.userId, userId));
}

/**
 * Clears every identity-derived/account-flow field Reset Entire Account
 * names — `username`, `onboarding_completed_at` (so the learner "must
 * complete onboarding again"), and `display_name` ("internal provisioning
 * may repopulate identity-derived fields... after reset" — provisioning
 * itself never auto-populates this from Clerk either, so `NULL` here
 * matches a freshly provisioned account exactly, not a special
 * "repopulated" state). `timezone`/`active_language_id` reset to
 * `provisionUser`'s own literal defaults (`"UTC"`, the configured default
 * language) — not named explicitly by the spec's list, but "the learner
 * should effectively return to a fresh Polyglot account" is otherwise
 * violated by a stale timezone/language choice surviving the reset.
 *
 * Never touches `clerk_user_id`, `role`, `id`, or any sandbox column —
 * "Reset Entire Account keeps the external identity/login," and role/
 * sandbox status are account-*type* facts, not learner application state.
 */
export async function resetUserIdentityFields(
  db: DbClient,
  input: { userId: string; defaultLanguageId: string; now: Date },
): Promise<void> {
  await db
    .update(users)
    .set({
      username: null,
      displayName: null,
      onboardingCompletedAt: null,
      timezone: "UTC",
      activeLanguageId: input.defaultLanguageId,
      updatedAt: input.now,
    })
    .where(eq(users.id, input.userId));
}
