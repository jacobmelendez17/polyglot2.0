import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { db } from "@/db/client";
import { SANDBOX_SESSION_COOKIE, verifySandboxGrant } from "@/domains/sandbox/sandbox-session-token";
import { AppError } from "@/lib/errors/app-error";

import { findUserByClerkUserId, findUserById, findUsersByIds, provisionUser } from "./user-repository";
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
