import type { curriculumImportRowClassificationEnum, curriculumImportRowDispositionEnum, curriculumImportStatusEnum } from "@/db/schema";
import type { ImportFieldChange } from "./bulk-import-service";

/**
 * Spec 19's import processing state machine and its persisted rows. These
 * types describe `curriculum_imports`/`curriculum_import_rows`
 * (`db/schema/curriculum-imports.ts`) as domain view models — never the raw
 * Drizzle row shapes — matching this codebase's rule against exposing
 * database row types as a public domain API.
 */

export type CurriculumImportStatus = (typeof curriculumImportStatusEnum.enumValues)[number];
export type CurriculumImportRowClassification = (typeof curriculumImportRowClassificationEnum.enumValues)[number];
export type CurriculumImportRowDisposition = (typeof curriculumImportRowDispositionEnum.enumValues)[number];

export type CurriculumImportRecord = {
  id: string;
  environment: string;
  languageId: string;
  originalFilename: string;
  fileExtension: string;
  s3Bucket: string;
  s3Key: string;
  sourceSha256: string;
  uploadedByUserId: string;
  status: CurriculumImportStatus;
  totalRows: number;
  createCount: number;
  updateCount: number;
  moveCount: number;
  unchangedCount: number;
  reviewCount: number;
  skippedCount: number;
  previewVersion: number;
  confirmedPreviewVersion: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
  sourceImportId: string | null;
  uploadedAt: Date | null;
  previewStartedAt: Date | null;
  previewCompletedAt: Date | null;
  confirmedAt: Date | null;
  importStartedAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  archivedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CurriculumImportRowRecord = {
  id: string;
  importId: string;
  rowNumber: number;
  itemType: "vocabulary" | "grammar" | null;
  displayTerm: string | null;
  levelNumber: number | null;
  groupNumber: number | null;
  classification: CurriculumImportRowClassification;
  previousClassification: CurriculumImportRowClassification | null;
  resolvedLearningItemId: string | null;
  changedFields: ImportFieldChange[] | null;
  reviewReasonCode: string | null;
  reviewReason: string | null;
  adminDisposition: CurriculumImportRowDisposition | null;
  changedSincePreview: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCurriculumImportInput = {
  languageId: string;
  environment: string;
  uploadedByUserId: string;
  originalFilename: string;
  fileExtension: string;
  s3Bucket: string;
  s3Key: string;
  sourceSha256: string;
  sourceImportId?: string | null;
};

/** One resolved preview row, ready to persist — the shape `recordPreviewResult` replaces a preview with. */
export type CurriculumImportRowPreviewInput = {
  rowNumber: number;
  itemType: "vocabulary" | "grammar" | null;
  displayTerm: string | null;
  levelNumber: number | null;
  groupNumber: number | null;
  classification: CurriculumImportRowClassification;
  resolvedLearningItemId: string | null;
  changedFields: ImportFieldChange[] | null;
  reviewReasonCode: string | null;
  reviewReason: string | null;
};

export type CurriculumImportsPage = { items: CurriculumImportRecord[]; nextCursor: string | null };
export type CurriculumImportRowsPage = { items: CurriculumImportRowRecord[]; nextCursor: string | null };
