import type { DbClient } from "@/db/client";
import { previewVocabularyImport } from "@/domains/admin/bulk-import-service";
import type { ImportRowPreview } from "@/domains/admin/bulk-import-service";
import {
  markCurriculumImportFailed,
  markCurriculumImportPreviewStarted,
  markCurriculumImportUploaded,
  recordCurriculumImportPreview,
} from "@/domains/admin/curriculum-import-service";
import { getCurriculumImportById } from "@/domains/admin/curriculum-import-repository";
import type { CurriculumImportRowPreviewInput } from "@/domains/admin/curriculum-import-types";
import { parseVocabularyImportFile } from "@/domains/curriculum/vocabulary-import-file-parser";
import { validateVocabularyImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import type { ImportFieldChange } from "@/domains/admin/bulk-import-service";
import type { CurriculumImportStorage } from "@/providers/storage/types";
import { parseCurriculumImportObjectKey } from "@/providers/storage/curriculum-import-object-key";

/**
 * The preview job (spec 19 §7/§48 step 10) — reused, never reimplemented:
 * this calls exactly the same `previewVocabularyImport` the synchronous
 * Admin dialog calls today (`bulk-import-service.ts`), just invoked from an
 * SQS-triggered Lambda instead of a Server Action.
 */

const errorCode = (message: string) => (message.length > 200 ? `${message.slice(0, 197)}...` : message);

/**
 * Flattens an error's `.cause` chain into one readable string. Spec 19 §34's
 * "observability through Polyglot's own persisted state, not paid log
 * ingestion" only actually works if the persisted summary carries the real
 * underlying reason — a wrapped driver/query error's top-level `.message`
 * alone (e.g. drizzle's "Failed query: select ...") is nearly useless
 * without the `.cause` underneath it, and this Lambda has no CloudWatch
 * Logs permission (§34) to fall back on for that detail.
 */
function describeErrorChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  let current: unknown = error.cause;
  for (let depth = 0; current && depth < 5; depth++) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(" | caused by: ");
}

export class PreviewJobError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PreviewJobError";
  }
}

function describeParseError(error: { type: string; message?: string; columns?: string[]; count?: number }): string {
  if (error.type === "missing_columns") return `Missing required column(s): ${error.columns?.join(", ")}.`;
  if (error.type === "too_many_rows") return `This file has ${error.count} rows, over the import limit.`;
  return error.message ?? "This file could not be parsed.";
}

/** Maps `bulk-import-service.ts`'s preview output onto the persisted row shape (spec 19 §20) — placement is folded into `changedFields` as synthetic level/group entries rather than adding dedicated columns, reusing the existing `{field, from, to}` shape. */
function toRowPreviewInput(row: ImportRowPreview): CurriculumImportRowPreviewInput {
  const displayTerm = row.fields ? (row.fields.itemType === "vocabulary" ? row.fields.term : row.fields.structure) : (row.raw.word ?? null);
  const levelNumber = row.fields?.levelNumber ?? null;
  const groupNumber = row.fields?.itemType === "vocabulary" ? row.fields.groupNumber : null;

  const changedFields: ImportFieldChange[] = [...row.changes];
  if (row.placement) {
    changedFields.push({ field: "level", from: String(row.placement.fromLevelNumber), to: String(row.placement.toLevelNumber) });
    if (row.placement.fromGroupNumber !== row.placement.toGroupNumber) {
      changedFields.push({
        field: "group",
        from: row.placement.fromGroupNumber === null ? null : String(row.placement.fromGroupNumber),
        to: row.placement.toGroupNumber === null ? null : String(row.placement.toGroupNumber),
      });
    }
  }

  const reviewReasonCode = row.action === "blocked" ? (row.fields === null ? "INVALID_ROW" : "BLOCKED") : null;
  const reviewReason =
    row.action === "blocked" ? (row.fields === null ? row.fieldIssues.map((issue) => issue.message).join(" ") : row.blockedReason) : null;

  return {
    rowNumber: row.rowNumber,
    itemType: row.fields?.itemType ?? null,
    displayTerm: displayTerm ?? null,
    levelNumber,
    groupNumber,
    classification: row.action,
    resolvedLearningItemId: row.matchedItemId,
    changedFields: changedFields.length > 0 ? changedFields : null,
    reviewReasonCode,
    reviewReason,
  };
}

export type PreviewJobInput = { bucket: string; key: string };

export async function runPreviewJob(db: DbClient, storage: CurriculumImportStorage, { key }: PreviewJobInput): Promise<void> {
  const parsedKey = parseCurriculumImportObjectKey(key);
  if (!parsedKey) {
    throw new Error(`Object key "${key}" is not a recognized curriculum-import source key.`);
  }
  const { importId, fileExtension } = parsedKey;

  try {
    const importRecord = await getCurriculumImportById(db, importId);
    if (!importRecord) {
      throw new Error(`No curriculum_imports row exists for id "${importId}".`);
    }

    // Both idempotent no-ops when a duplicate S3/SQS delivery re-runs this
    // (spec 19 §7) and the import has already moved past these states.
    await markCurriculumImportUploaded(db, importId);
    await markCurriculumImportPreviewStarted(db, importId);

    const fileContent = await storage.getObjectText(key);
    const delimiter = fileExtension === "tsv" ? "\t" : ",";
    const parsed = parseVocabularyImportFile(fileContent, delimiter);
    if (!parsed.ok) {
      throw new PreviewJobError("IMPORT_PARSE_FAILED", describeParseError(parsed.error));
    }

    const validatedRows = parsed.rows.map((row, index) => validateVocabularyImportRow(row, index));
    const previews = await previewVocabularyImport(db, { languageId: importRecord.languageId, validatedRows });

    await recordCurriculumImportPreview(db, { importId, rows: previews.map(toRowPreviewInput) });
  } catch (error) {
    const code = error instanceof PreviewJobError ? error.code : "IMPORT_PREVIEW_FAILED";
    const fullMessage = describeErrorChain(error);
    const summary = errorCode(fullMessage);
    // Best-effort — if Neon itself is unreachable this write can fail too,
    // in which case SQS retry/DLQ remains the safety net (spec 19 §35).
    await markCurriculumImportFailed(db, { importId, errorCode: code, errorSummary: summary }).catch(() => {});
    // Rethrown with the full cause chain folded into the message (not just
    // the original error) — this Lambda has no CloudWatch Logs permission
    // (§34), so a synchronous `aws lambda invoke` and the persisted
    // `last_error_summary` above are the only two places this detail can
    // ever surface.
    throw new Error(fullMessage);
  }
}
