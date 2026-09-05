/**
 * Structured Admin audit action identifiers (spec 11 §48). `IMPORT_COMMITTED`
 * is intentionally absent — CSV import was descoped 2026-09-05 (see
 * progress-tracker.md). This list grows as later Admin units ship real
 * mutations; add the new action here and nowhere else.
 */
export const ADMIN_AUDIT_ACTIONS = [
  "CURRICULUM_ITEM_CREATED",
  "CURRICULUM_ITEM_UPDATED",
  "CURRICULUM_ITEM_PUBLISHED",
  "CURRICULUM_ITEM_ARCHIVED",
  "CURRICULUM_ITEM_DELETED",
  "CURRICULUM_ITEM_MOVED",
  "CURRICULUM_ITEM_REORDERED",
  "LEVEL_UPDATED",
  "GROUP_CREATED",
  "GROUP_UPDATED",
  "GROUP_ARCHIVED",
  "DUPLICATE_APPROVED",
  "SANDBOX_RESET",
  "SANDBOX_STAGE_CHANGED",
  "SANDBOX_TIME_CHANGED",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/** One persisted administrative mutation record (spec 11 §47). */
export interface AdminAuditEvent {
  id: string;
  actorUserId: string;
  action: AdminAuditAction;
  resourceType: string;
  resourceId: string | null;
  beforeData: unknown;
  afterData: unknown;
  reason: string | null;
  correlationId: string | null;
  createdAt: Date;
}

/**
 * Input to `recordAuditEvent`. The caller is responsible for having already
 * authorized the action being recorded — this domain only writes down what
 * happened, it does not re-check `canAccessAdminArea`/`canManageCurriculum`
 * itself, matching how `domains/srs`'s `insertReviewEvent` trusts its caller.
 */
export type RecordAuditEventInput = {
  actorUserId: string;
  action: AdminAuditAction;
  resourceType: string;
  resourceId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  /**
   * Overrides the row's `createdAt` instead of the database's `now()`
   * default. Omit for normal use — every real audit event is its own
   * request/transaction in production, so `now()` differs naturally between
   * them. This exists for callers that need to pin the exact moment (a
   * backfill, or aligning with a mutation decided slightly earlier in the
   * same transaction) and for deterministic tests — Postgres's unqualified
   * `now()` returns the *transaction-start* time for every statement in a
   * transaction, so several events inserted in one transaction would
   * otherwise all land on the identical timestamp.
   */
  createdAt?: Date;
  reason?: string | null;
  correlationId?: string | null;
};

export type AuditEventFilters = {
  actorUserId?: string;
  action?: AdminAuditAction;
  resourceType?: string;
  resourceId?: string;
  /** Inclusive lower bound on `createdAt`. */
  from?: Date;
  /** Inclusive upper bound on `createdAt`. */
  to?: Date;
};

export type GetAuditEventsInput = AuditEventFilters & {
  limit: number;
  /** Opaque cursor from a previous page's `nextCursor`; omit for the first page. */
  cursor?: string | null;
};

export type AuditEventsPage = {
  items: AdminAuditEvent[];
  /** Opaque cursor for the next page, or `null` when this page is the last. */
  nextCursor: string | null;
};
