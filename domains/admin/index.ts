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
  ADMIN_CEFR_LEVELS,
  ADMIN_OVERVIEW_RECORD_ID,
  ADMIN_RESOURCE_ACTIONS,
  LEVEL_LIST_MAX,
  LEVEL_LIST_SORT,
  CURRICULUM_ITEM_TYPES,
  CURRICULUM_LIST_MAX_PAGE_SIZE,
  CURRICULUM_LIST_PAGE_SIZE,
  CURRICULUM_LIST_SORT,
  CURRICULUM_NEEDS_FILTERS,
  CURRICULUM_STATUSES,
  REVIEW_KINDS,
  REVIEW_LIST_MAX_PAGE_SIZE,
  REVIEW_LIST_PAGE_SIZE,
  REVIEW_LIST_SORT,
  adminApiErrorSchema,
  adminLevelCreateRequestSchema,
  adminLevelCreateResultSchema,
  adminLevelListQuerySchema,
  adminLevelListSchema,
  adminLevelPathSchema,
  adminLevelRowSchema,
  adminLevelUpdateRequestSchema,
  adminLevelUpdateResultSchema,
  adminReviewListQuerySchema,
  adminReviewPageSchema,
  adminReviewPublishRequestSchema,
  adminReviewPublishResultSchema,
  adminReviewRowSchema,
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
  AdminLevelCreateRequest,
  AdminLevelCreateResult,
  AdminLevelList,
  AdminLevelListQuery,
  AdminLevelRow,
  AdminLevelUpdateRequest,
  AdminLevelUpdateResult,
  AdminMe,
  AdminOverview,
  AdminPermissions,
  AdminResourceAction,
  AdminReviewListQuery,
  AdminReviewPage,
  AdminReviewPublishRequest,
  AdminReviewPublishResult,
  AdminReviewRow,
} from "./admin-api-contract";
export {
  buildAdminCurriculumPage,
  buildAdminLevelList,
  buildAdminMe,
  buildAdminReviewPage,
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
