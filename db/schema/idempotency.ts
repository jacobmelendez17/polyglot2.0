import { index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

/** Spec 08 §8 — Idempotency Status. */
export const idempotencyStatusEnum = pgEnum("idempotency_status", ["in_progress", "succeeded"]);

/**
 * Idempotency-key storage (spec 08 §53). This spec creates the mechanism
 * only — it has no user-facing consumer yet (spec 07 unit 6 is the first).
 * `response_snapshot` must never contain raw learner answers, tokens, or
 * credentials, per architecture.md's sensitive-content rules.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stable logical operation name, e.g. "lesson.complete" — never a URL. */
    operation: text("operation").notNull(),
    /** The client-generated UUID for this logical operation. */
    key: uuid("key").notNull(),
    /** Stable hash over a canonical serialization of the request payload. */
    requestHash: text("request_hash").notNull(),
    status: idempotencyStatusEnum("status").notNull().default("in_progress"),
    responseSnapshot: jsonb("response_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    unique("idempotency_keys_user_operation_key_key").on(t.userId, t.operation, t.key),
    index("idempotency_keys_expires_at_idx").on(t.expiresAt),
  ],
);
