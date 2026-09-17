import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { isUniqueViolation } from "@/db/postgres-errors";
import {
  languages,
  levels,
  userLanguageSettings,
  userNotificationPreferences,
  userPreferences,
  users,
  userLevelProgress,
} from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";

import type { ContentPreferences } from "./content-preferences";
import { DEFAULT_CONTENT_PREFERENCES } from "./content-preferences";
import type {
  CurriculumMode,
  GrammarPlacement,
  LanguageSettings,
} from "./curriculum-preference";
import type { NotificationPreferences } from "./notification-preferences";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notification-preferences";
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
    username: row.username,
    timezone: row.timezone,
    activeLanguageId: row.activeLanguageId,
    isSandbox: row.isSandbox,
    sandboxOwnerUserId: row.sandboxOwnerUserId,
    onboardingCompletedAt: row.onboardingCompletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findUserByClerkUserId(
  db: DbClient,
  clerkUserId: string,
): Promise<PolyglotUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row ? toPolyglotUser(row) : null;
}

export async function findUserById(
  db: DbClient,
  id: string,
): Promise<PolyglotUser | null> {
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
export async function completeOnboarding(
  db: DbClient,
  userId: string,
  now: Date,
): Promise<PolyglotUser | null> {
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
const LANGUAGE_SETTINGS_COLUMNS = {
  userId: userLanguageSettings.userId,
  languageId: userLanguageSettings.languageId,
  curriculumMode: userLanguageSettings.curriculumMode,
  selectedVocabularyGroupId: userLanguageSettings.selectedVocabularyGroupId,
  grammarPlacement: userLanguageSettings.grammarPlacement,
  lessonBatchSize: userLanguageSettings.lessonBatchSize,
  autoPronounceLessons: userLanguageSettings.autoPronounceLessons,
};

type LanguageSettingsRow = {
  userId: string;
  languageId: string;
  curriculumMode: typeof userLanguageSettings.$inferSelect.curriculumMode;
  selectedVocabularyGroupId: string | null;
  grammarPlacement: GrammarPlacement;
  lessonBatchSize: number;
  autoPronounceLessons: boolean;
};

/**
 * The Postgres enum still contains spec 20's pre-migration labels
 * (`theme`/`random`/`balanced` — see `curriculumModeEnum`'s docstring for
 * why they were never dropped), so Drizzle's inferred column type is wider
 * than the application-level `CurriculumMode` this domain actually reads and
 * writes. No row should hold one of those values after the backfill
 * migration — application code never writes them again — but a read
 * shouldn't crash if one somehow still does; it re-applies the exact same
 * mapping the backfill used, as a defensive fallback rather than a new rule.
 */
function normalizeLegacyCurriculumMode(
  mode: LanguageSettingsRow["curriculumMode"],
): CurriculumMode {
  if (mode === "theme") return "choose_group";
  if (mode === "random" || mode === "balanced") return "variety";
  return mode;
}

function toLanguageSettings(row: LanguageSettingsRow): LanguageSettings {
  return {
    ...row,
    curriculumMode: normalizeLegacyCurriculumMode(row.curriculumMode),
  };
}

export async function findLanguageSettings(
  db: DbClient,
  userId: string,
  languageId: string,
): Promise<LanguageSettings | null> {
  const [row] = await db
    .select(LANGUAGE_SETTINGS_COLUMNS)
    .from(userLanguageSettings)
    .where(
      and(
        eq(userLanguageSettings.userId, userId),
        eq(userLanguageSettings.languageId, languageId),
      ),
    )
    .limit(1);
  return row ? toLanguageSettings(row) : null;
}

/**
 * Records the learner's curriculum mode ("Learning Queue", spec 20), and the
 * group that goes with it in Choose Group as You Go. One upsert, so choosing
 * during onboarding and changing the choice later are the same write with
 * the same rules — there is no separate "first time" path to drift.
 *
 * Any mode other than `choose_group` stores `null` for the selection, which
 * is both what the check constraint requires and what stops a stale group
 * from silently reappearing if the learner switches away and back. Nothing
 * here touches progress, SRS state, unlocks, or `grammar_placement` (a
 * separate narrow mutation, `saveGrammarPlacement`) — "changing Learning
 * Queue affects future lesson generation only" holds because this row is
 * all there is to change.
 */
export async function saveCurriculumPreference(
  db: DbClient,
  input: {
    userId: string;
    languageId: string;
    curriculumMode: CurriculumMode;
    selectedVocabularyGroupId?: string | null;
  },
): Promise<LanguageSettings> {
  const selectedVocabularyGroupId =
    input.curriculumMode === "choose_group"
      ? (input.selectedVocabularyGroupId ?? null)
      : null;

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
      set: {
        curriculumMode: input.curriculumMode,
        selectedVocabularyGroupId,
        updatedAt: new Date(),
      },
    })
    .returning(LANGUAGE_SETTINGS_COLUMNS);
  return toLanguageSettings(row!);
}

/**
 * Spec 20 Lessons — Grammar Placement, saved independently of the
 * curriculum mode it modifies the interpretation of (Settings Security's
 * "prefer narrow mutations"). Requires an existing settings row — a learner
 * reaches the Lessons Settings page only after choosing a Learning Queue
 * mode at all (onboarding gates on exactly that), so this should never
 * legitimately miss in practice; `ITEM_NOT_FOUND` is a defensive guard, not
 * an expected path.
 */
export async function saveGrammarPlacement(
  db: DbClient,
  input: {
    userId: string;
    languageId: string;
    grammarPlacement: GrammarPlacement;
  },
): Promise<LanguageSettings> {
  const [row] = await db
    .update(userLanguageSettings)
    .set({ grammarPlacement: input.grammarPlacement, updatedAt: new Date() })
    .where(
      and(
        eq(userLanguageSettings.userId, input.userId),
        eq(userLanguageSettings.languageId, input.languageId),
      ),
    )
    .returning(LANGUAGE_SETTINGS_COLUMNS);
  if (!row) {
    throw new AppError(
      "ITEM_NOT_FOUND",
      "Choose a Learning Queue mode before setting Grammar Placement.",
    );
  }
  return toLanguageSettings(row);
}

/** Spec 20 Lessons — Lesson Batch Size, saved independently for the same reason as `saveGrammarPlacement`. */
export async function saveLessonBatchSize(
  db: DbClient,
  input: { userId: string; languageId: string; lessonBatchSize: number },
): Promise<LanguageSettings> {
  const [row] = await db
    .update(userLanguageSettings)
    .set({ lessonBatchSize: input.lessonBatchSize, updatedAt: new Date() })
    .where(
      and(
        eq(userLanguageSettings.userId, input.userId),
        eq(userLanguageSettings.languageId, input.languageId),
      ),
    )
    .returning(LANGUAGE_SETTINGS_COLUMNS);
  if (!row) {
    throw new AppError(
      "ITEM_NOT_FOUND",
      "Choose a Learning Queue mode before setting Lesson Batch Size.",
    );
  }
  return toLanguageSettings(row);
}

/** Spec 20 Lessons — Auto Pronunciation, saved independently for the same reason as `saveGrammarPlacement`. */
export async function saveAutoPronounceLessons(
  db: DbClient,
  input: { userId: string; languageId: string; autoPronounceLessons: boolean },
): Promise<LanguageSettings> {
  const [row] = await db
    .update(userLanguageSettings)
    .set({
      autoPronounceLessons: input.autoPronounceLessons,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userLanguageSettings.userId, input.userId),
        eq(userLanguageSettings.languageId, input.languageId),
      ),
    )
    .returning(LANGUAGE_SETTINGS_COLUMNS);
  if (!row) {
    throw new AppError(
      "ITEM_NOT_FOUND",
      "Choose a Learning Queue mode before setting Auto Pronunciation.",
    );
  }
  return toLanguageSettings(row);
}

/**
 * This learner's account-wide content preferences (spec 20 General), or the
 * centralized defaults when they have never changed either — "a user should
 * not require a fully populated row containing every possible setting."
 */
export async function getContentPreferences(
  db: DbClient,
  userId: string,
): Promise<ContentPreferences> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row
    ? {
        hideEnglishReviews: row.hideEnglishReviews,
        showNsfwContent: row.showNsfwContent,
      }
    : DEFAULT_CONTENT_PREFERENCES;
}

/**
 * Persists one or both content-preference fields (spec 20's
 * `updateContentPreferences`). `input` only ever carries the field(s) the
 * calling toggle actually changed — the `ON CONFLICT` branch updates only
 * those columns, and the plain-insert branch relies on `user_preferences`'
 * own column defaults for the field(s) left unset, so a first-time save of
 * one toggle can never silently invent a value for the other.
 */
export async function saveContentPreferences(
  db: DbClient,
  userId: string,
  input: Partial<ContentPreferences>,
): Promise<ContentPreferences> {
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return {
    hideEnglishReviews: row.hideEnglishReviews,
    showNsfwContent: row.showNsfwContent,
  };
}

/**
 * This learner's account-wide notification preferences (spec 20
 * Notifications), or the centralized defaults when no row exists yet —
 * "absence of a row resolves to all true for these optional categories."
 */
export async function getNotificationPreferences(
  db: DbClient,
  userId: string,
): Promise<NotificationPreferences> {
  const [row] = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);
  return row
    ? {
        newsUpdates: row.newsUpdates,
        progressEmail: row.progressEmail,
        inactivityEmail: row.inactivityEmail,
        trialEmail: row.trialEmail,
      }
    : DEFAULT_NOTIFICATION_PREFERENCES;
}

/**
 * Persists one or more notification-preference fields. Same narrow-mutation
 * shape as `saveContentPreferences`: `input` carries only the field(s) the
 * calling toggle changed, so a first-time save of one toggle can never
 * silently invent a value for the other three — the plain-insert branch
 * relies on `user_notification_preferences`' own column defaults (all
 * `true`) for whatever is left unset.
 */
export async function saveNotificationPreferences(
  db: DbClient,
  userId: string,
  input: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const [row] = await db
    .insert(userNotificationPreferences)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: userNotificationPreferences.userId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return {
    newsUpdates: row.newsUpdates,
    progressEmail: row.progressEmail,
    inactivityEmail: row.inactivityEmail,
    trialEmail: row.trialEmail,
  };
}

/**
 * Persists the Polyglot-side half of a Name change (spec 20 Account — Name).
 * The Clerk-side sync happens in `user-service.ts`'s `updateName`, which
 * calls this after; this function does not know Clerk exists.
 */
export async function updateDisplayName(
  db: DbClient,
  userId: string,
  displayName: string,
): Promise<PolyglotUser> {
  const [row] = await db
    .update(users)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!row) {
    throw new AppError("ITEM_NOT_FOUND", "That account could not be found.");
  }
  return toPolyglotUser(row);
}

/**
 * Persists a Username change (spec 20 Account — Username). Relies entirely
 * on `users_username_lower_key` (a case-insensitive unique index) to decide
 * a race between two concurrent claims of the same name — "do not rely on a
 * client-side availability check as the final uniqueness guarantee" means
 * this must be check-the-constraint-by-attempting-the-write, never
 * check-then-insert, so nothing reads the table for availability first.
 */
export async function updateUsername(
  db: DbClient,
  userId: string,
  username: string,
): Promise<PolyglotUser> {
  try {
    const [row] = await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!row) {
      throw new AppError("ITEM_NOT_FOUND", "That account could not be found.");
    }
    return toPolyglotUser(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("USERNAME_TAKEN");
    }
    throw error;
  }
}

/** Spec 20 General — Timezone. `users.timezone` already exists (spec 08); this just gives it a Settings write path. */
export async function updateTimezone(
  db: DbClient,
  userId: string,
  timezone: string,
): Promise<PolyglotUser> {
  const [row] = await db
    .update(users)
    .set({ timezone, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!row) {
    throw new AppError("ITEM_NOT_FOUND", "That account could not be found.");
  }
  return toPolyglotUser(row);
}

export async function findUsersByIds(
  db: DbClient,
  ids: string[],
): Promise<PolyglotUser[]> {
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
export async function provisionUser(
  db: DbClient,
  clerkUserId: string,
): Promise<PolyglotUser> {
  return db.transaction(async (tx) => {
    const [language] = await tx
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, getDefaultLanguageCode()))
      .limit(1);
    if (!language) {
      throw new AppError(
        "PROVISIONING_FAILED",
        "The default language is not configured.",
      );
    }

    const [level1] = await tx
      .select({ id: levels.id })
      .from(levels)
      .where(and(eq(levels.languageId, language.id), eq(levels.levelNumber, 1)))
      .limit(1);
    if (!level1) {
      throw new AppError(
        "PROVISIONING_FAILED",
        "Level 1 of the default language is not configured.",
      );
    }

    const [inserted] = await tx
      .insert(users)
      .values({
        clerkUserId,
        role: "user",
        timezone: "UTC",
        activeLanguageId: language.id,
      })
      .onConflictDoNothing({
        target: users.clerkUserId,
        where: sql`${users.clerkUserId} IS NOT NULL`,
      })
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
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);
    if (!existing) {
      throw new AppError(
        "PROVISIONING_FAILED",
        "User provisioning failed unexpectedly.",
      );
    }
    return toPolyglotUser(existing);
  });
}
