import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { languages } from "./languages";

/** Spec 08 §8 — User Roles. The database is authoritative; Clerk metadata is never trusted for authorization. */
export const userRoleEnum = pgEnum("user_role", ["user", "admin", "beta-tester", "developer"]);

/**
 * Internal Polyglot user record (spec 08 §9). `clerk_user_id` is nullable —
 * sandbox personas (§73) are real user rows with no Clerk identity, so a
 * plain unique constraint would allow only one such row. A partial unique
 * index enforces uniqueness only where it's actually present.
 *
 * Never stores passwords, session tokens, or other Clerk-owned credentials —
 * Clerk owns authentication, Neon owns application data.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id"),
    role: userRoleEnum("role").notNull().default("user"),
    displayName: text("display_name"),
    timezone: text("timezone").notNull().default("UTC"),
    activeLanguageId: uuid("active_language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    isSandbox: boolean("is_sandbox").notNull().default(false),
    sandboxOwnerUserId: uuid("sandbox_owner_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "cascade",
    }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_clerk_user_id_key").on(t.clerkUserId).where(sql`${t.clerkUserId} IS NOT NULL`),
    index("users_sandbox_owner_user_id_idx").on(t.sandboxOwnerUserId),
    check(
      "users_sandbox_owner_consistency",
      sql`(${t.isSandbox} = true AND ${t.sandboxOwnerUserId} IS NOT NULL) OR (${t.isSandbox} = false AND ${t.sandboxOwnerUserId} IS NULL)`,
    ),
  ],
);
