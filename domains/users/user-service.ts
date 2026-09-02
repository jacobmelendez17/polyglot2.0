import { auth } from "@clerk/nextjs/server";

import { db } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";

import { findUserByClerkUserId, provisionUser } from "./user-repository";
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
  if (existing) return existing;

  return provisionUser(db, clerkUserId);
}

/** Like `resolveCurrentUser()`, but throws `UNAUTHENTICATED` instead of returning `null`. */
export async function requireUser(): Promise<PolyglotUser> {
  const user = await resolveCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED");
  }
  return user;
}
