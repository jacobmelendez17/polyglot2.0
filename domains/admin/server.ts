/**
 * Server-only entry point for `domains/admin`. `./audit-service.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files, never a `"use client"` component. `./index.ts` stays
 * safe for a client component to value-import (pure authorization
 * predicates and audit types only). See `domains/srs/server.ts` /
 * `domains/progress/server.ts` for the same pattern and why it exists —
 * this is the split the Unit 1 docstring anticipated before this domain
 * had anything DB-touching to export.
 */
export { getAuditEvents, recordAuditEvent } from "./audit-service";
export {
  applyDictionaryFieldsToItem,
  archiveCurriculumImport,
  archiveItem,
  bulkArchiveItems,
  bulkImportVocabulary,
  bulkMoveItems,
  bulkPublishPendingItems,
  confirmCurriculumImport,
  createCurriculumImportUpload,
  createItem,
  createLevel,
  createVocabularyGroup,
  deleteItem,
  getCurriculumImportStatus,
  listActiveCurriculumImports,
  listArchivedCurriculumImportsForHistory,
  listCurriculumImportRowsForReview,
  moveItem,
  mutateGrammarContentBlock,
  mutateItemExample,
  mutateItemResource,
  mutateUsageContext,
  permanentlyDeleteCurriculumImport,
  previewVocabularyImport,
  publishItem,
  reorderItems,
  reorderVocabularyGroups,
  resetDictionaryFieldOverride,
  resetOwnAccountProgress,
  resolveCurriculumImportRow,
  retryCurriculumImport,
  unarchiveCurriculumImport,
  updateItem,
  updateLevel,
  updateVocabularyGroup,
} from "./admin-mutation-service";
export type {
  CreateCurriculumImportUploadInput,
  CreateCurriculumImportUploadResult,
  PreviewVocabularyImportServiceInput,
} from "./admin-mutation-service";
export type { CurriculumImportsPage } from "./curriculum-import-types";
export type { ConfirmCurriculumImportResult } from "./curriculum-import-service";
export type {
  CurriculumImportRecord,
  CurriculumImportRowClassification,
  CurriculumImportRowDisposition,
  CurriculumImportRowRecord,
  CurriculumImportRowsPage,
  CurriculumImportStatus,
} from "./curriculum-import-types";
export type { ResetOwnAccountProgressServiceInput } from "./account-reset-service";
export type {
  BulkImportVocabularyResult,
  BulkImportVocabularyServiceInput,
  ImportRowDecision,
  ImportRowPreview,
} from "./bulk-import-service";
export type {
  ApplyDictionaryFieldsResult,
  ExampleMutation,
  ExampleServiceInput,
  UsageContextMutation,
  UsageContextServiceInput,
  ApplyDictionaryFieldsServiceInput,
  ArchiveItemServiceInput,
  BulkArchiveItemsServiceInput,
  BulkMoveItemsServiceInput,
  BulkPublishPendingItemsServiceInput,
  CreateItemServiceInput,
  CreateLevelServiceInput,
  CreateVocabularyGroupServiceInput,
  DeleteItemServiceInput,
  MoveItemServiceInput,
  PublishItemServiceInput,
  ReorderItemsServiceInput,
  ReorderVocabularyGroupsServiceInput,
  ResetDictionaryFieldServiceInput,
  UpdateItemServiceInput,
  UpdateLevelServiceInput,
  UpdateVocabularyGroupServiceInput,
} from "./publication-service";
