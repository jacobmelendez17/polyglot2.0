import { AppError } from "@/lib/errors/app-error";

import type { PolyglotUser, UserRole } from "./user-types";

/**
 * Centralized role checks (spec 08 §12) — pure and database-free, so pages
 * and handlers never re-implement `role === "admin"` themselves. Takes any
 * object with a `role` field (not just `PolyglotUser`) so it composes with
 * whatever shape a caller already has in hand.
 */
export function hasRole(user: Pick<PolyglotUser, "role">, allowed: UserRole | UserRole[]): boolean {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return roles.includes(user.role);
}

/** Throws `FORBIDDEN` unless `user` has one of `allowed`; otherwise returns `user` unchanged, for chaining. */
export function requireRole<T extends Pick<PolyglotUser, "role">>(user: T, allowed: UserRole | UserRole[]): T {
  if (!hasRole(user, allowed)) {
    throw new AppError("FORBIDDEN");
  }
  return user;
}
