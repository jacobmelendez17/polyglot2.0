/** Spec 08 §8 — User Roles. Never trust a client-supplied value against this type; the database is authoritative (see server.ts). */
export const USER_ROLES = ["user", "admin", "beta-tester", "developer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * The internal Polyglot user record (spec 08 §9), independent of the Drizzle
 * schema's own inferred row type — matches the hand-typed convention already
 * established by `domains/curriculum`'s types, so this domain's public
 * surface doesn't leak database-layer representation details.
 */
export interface PolyglotUser {
  id: string;
  clerkUserId: string | null;
  role: UserRole;
  displayName: string | null;
  timezone: string;
  activeLanguageId: string;
  isSandbox: boolean;
  sandboxOwnerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
