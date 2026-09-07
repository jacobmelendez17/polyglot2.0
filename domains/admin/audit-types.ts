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
  "LEVEL_CREATED",
  "LEVEL_UPDATED",
  "GROUP_CREATED",
  "GROUP_UPDATED",
  "GROUP_ARCHIVED",
  "GROUP_REORDERED",
  "DUPLICATE_APPROVED",
  "SANDBOX_RESET",
  "SANDBOX_LEVEL_SIMULATED",
  "SANDBOX_STAGE_CHANGED",
  "SANDBOX_REVIEWS_FORCED_DUE",
  // Time simulation is deliberately not built yet (2026-09-06 scope
  // decision — needs a clock abstraction reaching across domains/srs's
  // scheduling logic, not a contained admin-panel change). This action
  // stays declared, matching spec 11 §48's action list, but nothing
  // currently records it — see progress-tracker.md's Sandbox entry.
  "SANDBOX_TIME_CHANGED",
  // Spec 12 (dictionary/lexicon). Mapping actions are recorded in the same
  // transaction as the mutation they describe; the two import actions are
  // recorded only when an operator id is configured for the import CLI (see
  // `domains/lexicon/lexicon-source-config.ts` — `lexical_imports` is the
  // durable operational record either way, and inventing a synthetic actor
  // to satisfy this table's foreign key would put a fictional user in the
  // permanent audit trail).
  "DICTIONARY_MAPPING_CHANGED",
  "DICTIONARY_MAPPING_CONFIRMED",
  "DICTIONARY_SENSE_SELECTED",
  "DICTIONARY_PRONUNCIATION_SELECTED",
  "DICTIONARY_IMPORT_COMPLETED",
  "DICTIONARY_IMPORT_ROLLED_BACK",
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
