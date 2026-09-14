import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { db } from "@/db/client";
import { getRateLimiter } from "@/providers/rate-limit";
import { SANDBOX_SESSION_COOKIE, verifySandboxGrant } from "@/domains/sandbox/sandbox-session-token";
import { AppError } from "@/lib/errors/app-error";

import type { ContentPreferences } from "./content-preferences";
import type { CurriculumMode, GrammarPlacement, LanguageSettings } from "./curriculum-preference";
import {
  completeOnboarding as completeOnboardingInDb,
  findLanguageSettings,
  findUserByClerkUserId,
  findUserById,
  findUsersByIds,
  getContentPreferences as getContentPreferencesFromDb,
  provisionUser,
  saveContentPreferences,
  saveCurriculumPreference,
  saveGrammarPlacement,
  updateDisplayName,
  updateTimezone as updateTimezoneInDb,
  updateUsername as updateUsernameInDb,
} from "./user-repository";
import { splitDisplayNameForClerk } from "./clerk-name-sync";
import { canViewSandboxAs } from "./sandbox-view";
import type { PolyglotUser } from "./user-types";

/**
 * Clerk → Polyglot resolver (spec 08 §10). Returns `null` when there is no
 * authenticated Clerk identity; otherwise looks up the internal user or
 * safely provisions one. The database role on the returned record is always
 * authoritative — Clerk's own metadata is never consulted here (note there
 * is no code path anywhere in this file that reads `sessionClaims` or any
 * other Clerk metadata).
 *
 * Not guarded with `import "server-only"` directly — importing `db` from
 * `db/client.ts` already carries that guard transitively (see
 * `domains/lessons/server.ts` for the established precedent of relying on
 * the barrel/underlying-secret's own guard rather than duplicating it on
 * every file that touches it).
 */
export async function resolveCurrentUser(): Promise<PolyglotUser | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existing = await findUserByClerkUserId(db, clerkUserId);
  const actor = existing ?? (await provisionUser(db, clerkUserId));

  return (await resolveSandboxView(actor)) ?? actor;
}

/**
 * Spec 11's "Open Sandbox": when a valid grant cookie is present, learner
 * pages resolve to the admin's own sandbox persona instead of the admin.
 *
 * The cookie is treated as a *request*, never as proof. Every one of these
 * must hold against the database before the swap happens, and any failure
 * silently falls back to the real user rather than erroring:
 *
 * 1. the grant verifies and has not expired;
 * 2. the authenticated identity is the admin named in the grant;
 * 3. that admin may access the Admin area at all;
 * 4. the target exists, is a sandbox persona, and is owned by that admin.
 *
 * Nothing here can surface a real learner's account: (4) requires
 * `is_sandbox`, and a sandbox row has no Clerk identity of its own.
 */
async function resolveSandboxView(actor: PolyglotUser): Promise<PolyglotUser | null> {
  const cookieStore = await cookies();
  const grant = await verifySandboxGrant(cookieStore.get(SANDBOX_SESSION_COOKIE)?.value);
  if (!grant || grant.adminUserId !== actor.id) return null;

  const target = await findUserById(db, grant.sandboxUserId);
  if (!target) return null;
  return canViewSandboxAs(actor, target) ? target : null;
}

/** Like `resolveCurrentUser()`, but throws `UNAUTHENTICATED` instead of returning `null`. */
export async function requireUser(): Promise<PolyglotUser> {
  const user = await resolveCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED");
  }
  return user;
}

export async function getUsersByIds(ids: string[]): Promise<PolyglotUser[]> {
  return findUsersByIds(db, ids);
}

/**
 * Records that this user finished onboarding (spec 15). Safe to call
 * repeatedly — the underlying update is guarded on the column still being
 * `NULL`, so a repeated "Start Now!" click cannot produce a second
 * completion or overwrite the first one's timestamp.
 */
export async function completeOnboarding(userId: string, now: Date = new Date()): Promise<PolyglotUser | null> {
  return completeOnboardingInDb(db, userId, now);
}

/** This learner's settings for one language, or `null` when they have not chosen a curriculum mode yet (spec 16). */
export async function getLanguageSettings(userId: string, languageId: string): Promise<LanguageSettings | null> {
  return findLanguageSettings(db, userId, languageId);
}

/**
 * Persists the curriculum mode (spec 16). Rate limited here rather than in
 * the repository, for the same reason every other service in this codebase
 * does it at this layer: the limiter provider is `server-only`-guarded and
 * would make the repository untestable against a rolled-back transaction.
 *
 * A sandbox persona is refused: the Sandbox sets a persona's mode through
 * `domains/sandbox`, which audits it as an admin action. Letting a learner
 * route write it here would be a second, unaudited path to the same row.
 */
export async function setCurriculumPreference(input: {
  userId: string;
  languageId: string;
  curriculumMode: CurriculumMode;
  selectedVocabularyGroupId?: string | null;
}): Promise<LanguageSettings> {
  const decision = await getRateLimiter().check({ policy: "curriculum-preference", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  return saveCurriculumPreference(db, input);
}

/** Spec 20 Lessons — Grammar Placement. Ordinary "account-settings" rate limit, matching every other narrow Settings field save. */
export async function updateGrammarPlacement(input: {
  userId: string;
  languageId: string;
  grammarPlacement: GrammarPlacement;
}): Promise<LanguageSettings> {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  return saveGrammarPlacement(db, input);
}

/**
 * Spec 20 Account — Name. Polyglot's `display_name` is the one column the
 * rest of the app reads (the dashboard greeting included, as of this unit),
 * but the Clerk identity is kept in sync too — "Name must synchronize with
 * the authenticated Clerk identity and Polyglot's internal user
 * representation." Clerk splits first/last name; Polyglot stores one
 * free-text field, so the sync splits on the first space rather than
 * inventing a first/last split in Polyglot's own schema for a value nothing
 * else needs split.
 *
 * A sandbox persona has no Clerk identity (`clerkUserId` is `null` by
 * construction — ADR-020), so the Clerk sync is skipped rather than erroring;
 * the Polyglot-side write still happens, since Sandbox display names are a
 * real (if isolated) testing convenience.
 */
export async function updateName(input: {
  userId: string;
  clerkUserId: string | null;
  displayName: string;
}): Promise<PolyglotUser> {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }

  if (input.clerkUserId) {
    const client = await clerkClient();
    await client.users.updateUser(input.clerkUserId, splitDisplayNameForClerk(input.displayName));
  }

  return updateDisplayName(db, input.userId, input.displayName);
}

/**
 * Spec 20 Account — Username. Unlike Name, there is nothing to sync to
 * Clerk — Username is "a Polyglot identifier," deliberately separate from
 * anything Clerk manages. The tighter `"username-change"` policy (not
 * `"account-settings"`) reflects Settings Security's explicit call-out that
 * username change needs a stronger limit than an ordinary field.
 *
 * Uniqueness is decided by `users_username_lower_key` inside
 * `updateUsername`, not here — this function never reads the table for
 * availability first.
 */
export async function updateUsername(input: { userId: string; username: string }): Promise<PolyglotUser> {
  const decision = await getRateLimiter().check({ policy: "username-change", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }

  return updateUsernameInDb(db, input.userId, input.username);
}

/**
 * Spec 20 General — Timezone. Ordinary "account-settings" rate limit — this
 * is presentation/scheduling-anchor data (architecture.md: "changing
 * timezone does not make a review become due early"), not the sensitive
 * category Settings Security calls out for a tighter limit.
 */
export async function updateTimezone(input: { userId: string; timezone: string }): Promise<PolyglotUser> {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }

  return updateTimezoneInDb(db, input.userId, input.timezone);
}

/**
 * Spec 20 General — effective content preferences. The one place
 * `domains/curriculum`'s real-database lesson-selection binding resolves a
 * learner's NSFW preference from — architecture.md's "Server-Side Settings
 * Reads" names exactly this pairing ("Curriculum reads → authoritative
 * NSFW preference").
 */
export async function getEffectiveContentPreferences(userId: string): Promise<ContentPreferences> {
  return getContentPreferencesFromDb(db, userId);
}

/**
 * Spec 20's `updateContentPreferences`. `input` carries only the field(s)
 * the calling toggle changed — Hide English and NSFW Content save
 * independently, per "prefer narrow mutations" rather than one shared
 * request that could race between two tabs.
 */
export async function updateContentPreferences(
  userId: string,
  input: Partial<ContentPreferences>,
): Promise<ContentPreferences> {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }

  return saveContentPreferences(db, userId, input);
}
