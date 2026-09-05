import { z } from "zod";

import { ADMIN_AUDIT_ACTIONS } from "./audit-types";

/**
 * A permissive UUID-shape check (8-4-4-4-12 hex digits), not Zod's built-in
 * `z.uuid()` — that validator additionally enforces RFC 4122 version/variant
 * nibbles, which Postgres's own `uuid` column type does not require, and
 * which this codebase's seeded fixture IDs (`db/seed/test-fixtures.ts`,
 * e.g. `60000000-0000-0000-0000-000000000002`) deliberately don't have.
 * Confirmed directly: `z.uuid()` rejects that exact fixture ID.
 */
const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

/**
 * Boundary validation for `recordAuditEvent` (code-standards.md's "validate
 * untrusted input at runtime" rule) — `action` in particular must be one of
 * the known identifiers, since a typo'd action string would otherwise
 * silently create an unindexed, unfilterable audit category with no
 * compile-time or runtime safety net.
 */
export const recordAuditEventInputSchema = z.object({
  actorUserId: uuidLike,
  action: z.enum(ADMIN_AUDIT_ACTIONS),
  resourceType: z.string().trim().min(1),
  resourceId: z.string().trim().min(1).nullish(),
  beforeData: z.unknown().optional(),
  afterData: z.unknown().optional(),
  createdAt: z.date().optional(),
  reason: z.string().trim().min(1).nullish(),
  correlationId: z.string().trim().min(1).nullish(),
});

export const getAuditEventsInputSchema = z.object({
  actorUserId: uuidLike.optional(),
  action: z.enum(ADMIN_AUDIT_ACTIONS).optional(),
  resourceType: z.string().trim().min(1).optional(),
  resourceId: z.string().trim().min(1).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().trim().min(1).nullish(),
});
