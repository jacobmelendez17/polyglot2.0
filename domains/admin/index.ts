/**
 * Client-safe public surface for `domains/admin`: pure, database-free
 * authorization predicates and audit types only. DB-touching audit
 * persistence (`recordAuditEvent`/`getAuditEvents`) lives in `./server.ts`
 * instead — see `domains/lessons/server.ts` for why the split exists.
 * Future publication/sandbox orchestration (spec 11 §76) follows the same
 * split as it's added.
 */
export { canAccessAdminArea, canManageCurriculum } from "./authorization";
export { ADMIN_AUDIT_ACTIONS } from "./audit-types";
export type {
  AdminAuditAction,
  AdminAuditEvent,
  AuditEventFilters,
  AuditEventsPage,
  GetAuditEventsInput,
  RecordAuditEventInput,
} from "./audit-types";
