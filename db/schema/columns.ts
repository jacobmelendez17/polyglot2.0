import { timestamp } from "drizzle-orm/pg-core";

/**
 * Shared `created_at`/`updated_at` pair used by nearly every table.
 * `updated_at` is maintained at the application layer via Drizzle's
 * `$onUpdate` (spec 08 §21) — not a PostgreSQL trigger — so it only advances
 * on writes that actually go through Drizzle.
 */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}
