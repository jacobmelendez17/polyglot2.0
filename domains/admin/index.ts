/**
 * Client-safe public surface for `domains/admin`: pure, database-free
 * authorization predicates, audit types, and the Admin HTTP adapter's wire
 * contract and response builders (spec 26) only. DB-touching audit
 * persistence (`recordAuditEvent`/`getAuditEvents`) lives in `./server.ts`
 * instead — see `domains/lessons/server.ts` for why the split exists.
 * Future publication/sandbox orchestration (spec 11 §76) follows the same
 * split as it's added.
 */
export {
  canAccessAdminArea,
  canManageCurriculum,
  canPublishCurriculum,
  canUseDeveloperTools,
} from "./authorization";
export {
  ADMIN_API_ERROR_STATUS,
  ADMIN_OVERVIEW_RECORD_ID,
  ADMIN_RESOURCE_ACTIONS,
  CURRICULUM_ITEM_TYPES,
  CURRICULUM_LIST_MAX_PAGE_SIZE,
  CURRICULUM_LIST_PAGE_SIZE,
  CURRICULUM_LIST_SORT,
  CURRICULUM_NEEDS_FILTERS,
  CURRICULUM_STATUSES,
  adminApiErrorSchema,
  adminCurriculumListQuerySchema,
  adminCurriculumPageSchema,
  adminCurriculumRowSchema,
  adminMeSchema,
  adminOverviewSchema,
  adminPermissionsSchema,
} from "./admin-api-contract";
export type {
  AdminApiErrorBody,
  AdminApiErrorCode,
  AdminCurriculumListQuery,
  AdminCurriculumPage,
  AdminCurriculumRow,
  AdminCurriculumStatusCounts,
  AdminMe,
  AdminOverview,
  AdminPermissions,
  AdminResourceAction,
} from "./admin-api-contract";
export {
  buildAdminCurriculumPage,
  buildAdminMe,
  buildAdminOverview,
  buildAdminPermissions,
} from "./admin-api-views";
export { ADMIN_AUDIT_ACTIONS } from "./audit-types";
export type {
  AdminAuditAction,
  AdminAuditEvent,
  AuditEventFilters,
  AuditEventsPage,
  GetAuditEventsInput,
  RecordAuditEventInput,
} from "./audit-types";
