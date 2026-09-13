import { and, asc, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { curriculumImportRows, curriculumImports } from "@/db/schema";

import type {
  CreateCurriculumImportInput,
  CurriculumImportRecord,
  CurriculumImportRowClassification,
  CurriculumImportRowPreviewInput,
  CurriculumImportRowRecord,
  CurriculumImportRowsPage,
  CurriculumImportsPage,
  CurriculumImportStatus,
} from "./curriculum-import-types";

/**
 * Spec 19 §20's `curriculum_imports`/`curriculum_import_rows` persistence.
 * Takes an injected `DbClient`, matching every other repository in this
 * codebase, so a future Lambda worker's own Neon binding (spec 19 §31) can
 * call these functions directly rather than through anything Next.js-only.
 *
 * This file only reads/writes import *tracking* state. It never resolves or
 * mutates curriculum — that stays `bulk-import-service.ts`'s job, called
 * separately by whatever invokes it (the existing Server Action today, the
 * Lambda preview/commit jobs once they exist).
 */

type CurriculumImportRow = typeof curriculumImports.$inferSelect;
type CurriculumImportRowRow = typeof curriculumImportRows.$inferSelect;

function toCurriculumImportRecord(row: CurriculumImportRow): CurriculumImportRecord {
  return {
    id: row.id,
    environment: row.environment,
    languageId: row.languageId,
    originalFilename: row.originalFilename,
    fileExtension: row.fileExtension,
    s3Bucket: row.s3Bucket,
    s3Key: row.s3Key,
    sourceSha256: row.sourceSha256,
    uploadedByUserId: row.uploadedByUserId,
    status: row.status,
    totalRows: row.totalRows,
    createCount: row.createCount,
    updateCount: row.updateCount,
    moveCount: row.moveCount,
    unchangedCount: row.unchangedCount,
    reviewCount: row.reviewCount,
    skippedCount: row.skippedCount,
    previewVersion: row.previewVersion,
    confirmedPreviewVersion: row.confirmedPreviewVersion,
    attemptCount: row.attemptCount,
    lastErrorCode: row.lastErrorCode,
    lastErrorSummary: row.lastErrorSummary,
    sourceImportId: row.sourceImportId,
    uploadedAt: row.uploadedAt,
    previewStartedAt: row.previewStartedAt,
    previewCompletedAt: row.previewCompletedAt,
    confirmedAt: row.confirmedAt,
    importStartedAt: row.importStartedAt,
    completedAt: row.completedAt,
    archivedAt: row.archivedAt,
    archivedByUserId: row.archivedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCurriculumImportRowRecord(row: CurriculumImportRowRow): CurriculumImportRowRecord {
  return {
    id: row.id,
    importId: row.importId,
    rowNumber: row.rowNumber,
    itemType: row.itemType,
    displayTerm: row.displayTerm,
    levelNumber: row.levelNumber,
    groupNumber: row.groupNumber,
    classification: row.classification,
    previousClassification: row.previousClassification,
    resolvedLearningItemId: row.resolvedLearningItemId,
    changedFields: row.changedFields as CurriculumImportRowRecord["changedFields"],
    reviewReasonCode: row.reviewReasonCode,
    reviewReason: row.reviewReason,
    adminDisposition: row.adminDisposition,
    changedSincePreview: row.changedSincePreview,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createCurriculumImport(db: DbClient, input: CreateCurriculumImportInput): Promise<CurriculumImportRecord> {
  const [row] = await db
    .insert(curriculumImports)
    .values({
      id: input.id,
      environment: input.environment,
      languageId: input.languageId,
      originalFilename: input.originalFilename,
      fileExtension: input.fileExtension,
      s3Bucket: input.s3Bucket,
      s3Key: input.s3Key,
      uploadedByUserId: input.uploadedByUserId,
      sourceImportId: input.sourceImportId ?? null,
      status: "uploading",
    })
    .returning();
  return toCurriculumImportRecord(row!);
}

export async function getCurriculumImportById(db: DbClient, importId: string): Promise<CurriculumImportRecord | null> {
  const [row] = await db.select().from(curriculumImports).where(eq(curriculumImports.id, importId)).limit(1);
  return row ? toCurriculumImportRecord(row) : null;
}

/** Locks the import row for the duration of the caller's transaction — required before any state-machine transition, so two concurrent requests can't both act on the same stale status (mirrors `domains/decks`' row-lock pattern). */
export async function lockCurriculumImportForUpdate(db: DbClient, importId: string): Promise<CurriculumImportRecord | null> {
  const [row] = await db.select().from(curriculumImports).where(eq(curriculumImports.id, importId)).limit(1).for("update");
  return row ? toCurriculumImportRecord(row) : null;
}

type Cursor = { createdAt: string; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") {
    throw new Error("Invalid curriculum import cursor");
  }
  return parsed;
}

async function listByArchivedState(
  db: DbClient,
  { languageId, cursor, limit, archived }: { languageId: string; cursor?: string | null; limit: number; archived: boolean },
): Promise<CurriculumImportsPage> {
  const conditions = [eq(curriculumImports.languageId, languageId), archived ? isNotNull(curriculumImports.archivedAt) : isNull(curriculumImports.archivedAt)];

  if (cursor) {
    const decoded = decodeCursor(cursor);
    const cursorCreatedAt = new Date(decoded.createdAt);
    conditions.push(
      or(lt(curriculumImports.createdAt, cursorCreatedAt), and(eq(curriculumImports.createdAt, cursorCreatedAt), lt(curriculumImports.id, decoded.id)))!,
    );
  }

  const rows = await db
    .select()
    .from(curriculumImports)
    .where(and(...conditions))
    .orderBy(desc(curriculumImports.createdAt), desc(curriculumImports.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toCurriculumImportRecord),
    nextCursor: hasNextPage && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

/** Normal (non-archived) import history, newest first (spec 19 §19). */
export async function listCurriculumImports(db: DbClient, input: { languageId: string; cursor?: string | null; limit: number }): Promise<CurriculumImportsPage> {
  return listByArchivedState(db, { ...input, archived: false });
}

/** Archived-imports listing (spec 19 §25). */
export async function listArchivedCurriculumImports(
  db: DbClient,
  input: { languageId: string; cursor?: string | null; limit: number },
): Promise<CurriculumImportsPage> {
  return listByArchivedState(db, { ...input, archived: true });
}

type RowCursor = { rowNumber: number; id: string };

function encodeRowCursor(cursor: RowCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeRowCursor(value: string): RowCursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (typeof parsed?.rowNumber !== "number" || typeof parsed?.id !== "string") {
    throw new Error("Invalid curriculum import row cursor");
  }
  return parsed;
}

/** One import's rows, ascending by row number (the order the source file listed them) — never fetched unbounded, per code-standards.md. */
export async function listCurriculumImportRows(
  db: DbClient,
  input: { importId: string; cursor?: string | null; limit: number },
): Promise<CurriculumImportRowsPage> {
  const conditions = [eq(curriculumImportRows.importId, input.importId)];

  if (input.cursor) {
    const decoded = decodeRowCursor(input.cursor);
    conditions.push(
      or(gt(curriculumImportRows.rowNumber, decoded.rowNumber), and(eq(curriculumImportRows.rowNumber, decoded.rowNumber), gt(curriculumImportRows.id, decoded.id)))!,
    );
  }

  const rows = await db
    .select()
    .from(curriculumImportRows)
    .where(and(...conditions))
    .orderBy(asc(curriculumImportRows.rowNumber), asc(curriculumImportRows.id))
    .limit(input.limit + 1);

  const hasNextPage = rows.length > input.limit;
  const pageRows = hasNextPage ? rows.slice(0, input.limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toCurriculumImportRowRecord),
    nextCursor: hasNextPage && last ? encodeRowCursor({ rowNumber: last.rowNumber, id: last.id }) : null,
  };
}

/** Every row still needing an explicit disposition before the import can be confirmed (spec 19 §9) — a blocked row with no admin call yet. */
export async function countUnresolvedRows(db: DbClient, importId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(curriculumImportRows)
    .where(and(eq(curriculumImportRows.importId, importId), eq(curriculumImportRows.classification, "blocked"), isNull(curriculumImportRows.adminDisposition)));
  return row?.count ?? 0;
}

export async function setStatus(
  db: DbClient,
  importId: string,
  status: CurriculumImportStatus,
  extra: Partial<{
    uploadedAt: Date;
    previewStartedAt: Date;
    previewCompletedAt: Date;
    confirmedAt: Date;
    confirmedPreviewVersion: number;
    importStartedAt: Date;
    completedAt: Date;
    lastErrorCode: string | null;
    lastErrorSummary: string | null;
  }> = {},
): Promise<void> {
  await db
    .update(curriculumImports)
    .set({ status, ...extra })
    .where(eq(curriculumImports.id, importId));
}

export async function incrementAttemptCount(db: DbClient, importId: string): Promise<void> {
  await db
    .update(curriculumImports)
    .set({ attemptCount: sql`${curriculumImports.attemptCount} + 1` })
    .where(eq(curriculumImports.id, importId));
}

export type PreviewCounts = {
  totalRows: number;
  createCount: number;
  updateCount: number;
  moveCount: number;
  unchangedCount: number;
  reviewCount: number;
};

function countsFromRows(rows: CurriculumImportRowPreviewInput[]): PreviewCounts {
  const counts: PreviewCounts = { totalRows: rows.length, createCount: 0, updateCount: 0, moveCount: 0, unchangedCount: 0, reviewCount: 0 };
  for (const row of rows) {
    if (row.classification === "create") counts.createCount += 1;
    else if (row.classification === "update") counts.updateCount += 1;
    else if (row.classification === "move") counts.moveCount += 1;
    else if (row.classification === "unchanged") counts.unchangedCount += 1;
    else counts.reviewCount += 1;
  }
  return counts;
}

/**
 * Replaces this import's preview rows with a freshly computed set (spec 19
 * §7/§12 — the initial preview, and any re-preview forced by commit-time
 * revalidation), and moves the import to `needs_review` or
 * `ready_to_import` depending on whether anything still needs a decision.
 * `previousClassification`/`changedSincePreview` are set only on a
 * re-preview (`previousRows` supplied), comparing by row number.
 */
export async function recordPreviewResult(
  db: DbClient,
  {
    importId,
    rows,
    previousRows,
    sourceSha256,
  }: { importId: string; rows: CurriculumImportRowPreviewInput[]; previousRows?: Map<number, CurriculumImportRowClassification>; sourceSha256?: string },
): Promise<PreviewCounts> {
  await db.delete(curriculumImportRows).where(eq(curriculumImportRows.importId, importId));

  if (rows.length > 0) {
    await db.insert(curriculumImportRows).values(
      rows.map((row) => {
        const previous = previousRows?.get(row.rowNumber) ?? null;
        return {
          importId,
          rowNumber: row.rowNumber,
          itemType: row.itemType,
          displayTerm: row.displayTerm,
          levelNumber: row.levelNumber,
          groupNumber: row.groupNumber,
          classification: row.classification,
          previousClassification: previous,
          resolvedLearningItemId: row.resolvedLearningItemId,
          changedFields: row.changedFields,
          reviewReasonCode: row.reviewReasonCode,
          reviewReason: row.reviewReason,
          changedSincePreview: previous !== null && previous !== row.classification,
        };
      }),
    );
  }

  const counts = countsFromRows(rows);
  const hasUnresolved = counts.reviewCount > 0;
  await db
    .update(curriculumImports)
    .set({
      status: hasUnresolved ? "needs_review" : "ready_to_import",
      previewVersion: sql`${curriculumImports.previewVersion} + 1`,
      previewCompletedAt: new Date(),
      totalRows: counts.totalRows,
      createCount: counts.createCount,
      updateCount: counts.updateCount,
      moveCount: counts.moveCount,
      unchangedCount: counts.unchangedCount,
      reviewCount: counts.reviewCount,
      ...(sourceSha256 ? { sourceSha256 } : {}),
    })
    .where(eq(curriculumImports.id, importId));

  return counts;
}

export async function setRowDisposition(db: DbClient, rowId: string, disposition: "skip"): Promise<void> {
  await db.update(curriculumImportRows).set({ adminDisposition: disposition }).where(eq(curriculumImportRows.id, rowId));
}

export async function archiveCurriculumImport(db: DbClient, importId: string, archivedByUserId: string): Promise<void> {
  await db.update(curriculumImports).set({ archivedAt: new Date(), archivedByUserId }).where(eq(curriculumImports.id, importId));
}

export async function unarchiveCurriculumImport(db: DbClient, importId: string): Promise<void> {
  await db.update(curriculumImports).set({ archivedAt: null, archivedByUserId: null }).where(eq(curriculumImports.id, importId));
}

/** Permanent history deletion (spec 19 §26) — the import row's `ON DELETE CASCADE` FK removes its rows automatically. Never touches curriculum. */
export async function deleteCurriculumImport(db: DbClient, importId: string): Promise<void> {
  await db.delete(curriculumImports).where(eq(curriculumImports.id, importId));
}
