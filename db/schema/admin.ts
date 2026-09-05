import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * Administrative audit trail (spec 11 §47/§48, Unit 2). `action` and
 * `resourceType` are plain `text`, not a Postgres enum — unlike this
 * codebase's other small, effectively-fixed enums (`idempotency_status`,
 * `review_result`, `srs_stage`), the set of admin audit actions is expected
 * to keep growing across every future Admin unit (curriculum CRUD,
 * publishing, duplicate resolution, sandbox, ...), and a Postgres enum
 * would need its own reviewed migration for every new action name. Validity
 * is enforced by `domains/admin`'s Zod schema at the application boundary
 * instead (code-standards.md's boundary-validation rule), backstopped by
 * nothing at the database level beyond NOT NULL — the same tradeoff this
 * project already accepts for `curriculum`'s `resourceType`-shaped text
 * columns elsewhere.
 *
 * One row per administrative mutation (spec 11 §5's authorization flow ends
 * with "write audit event"). Callers insert this in the same transaction as
 * the mutation it records wherever one exists — `recordAuditEvent` accepts
 * an injected `DbClient` for exactly that reason (see `audit-repository.ts`).
 */
export const adminAuditEvents = pgTable(
  "admin_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    reason: text("reason"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Full audit log listing (spec 11 §49), keyset-paginated newest first.
    index("admin_audit_events_history_idx").on(t.createdAt.desc(), t.id.desc()),
    // Filter by actor, or by action, combined with the same date-ordered listing.
    index("admin_audit_events_actor_idx").on(t.actorUserId, t.createdAt.desc()),
    index("admin_audit_events_action_idx").on(t.action, t.createdAt.desc()),
    // Filter by resource type (and, when given, the specific resource).
    index("admin_audit_events_resource_idx").on(t.resourceType, t.resourceId),
  ],
);
