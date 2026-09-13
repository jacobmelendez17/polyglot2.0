import { createHash } from "node:crypto";

import type { DbClient } from "@/db/client";
import { previewVocabularyImport } from "@/domains/admin/bulk-import-service";
import type { ImportFieldChange, ImportRowPreview } from "@/domains/admin/bulk-import-service";
import type { CurriculumImportRowPreviewInput } from "@/domains/admin/curriculum-import-types";
import { parseVocabularyImportFile } from "@/domains/curriculum/vocabulary-import-file-parser";
import { validateVocabularyImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import type { CurriculumImportStorage } from "@/providers/storage/types";

/**
 * Shared between `preview-job.ts` (spec 19 §7/§10) and `commit-job.ts`
 * (§12's mandatory commit-time revalidation) — both need the exact same
 * "read the file, parse it, resolve it against current curriculum" pipeline,
 * and §12 depends on it producing byte-identical results to §7 for the
 * material-change comparison to mean anything. One implementation, not two
 * that could quietly drift apart.
 */

export const errorCode = (message: string) => (message.length > 200 ? `${message.slice(0, 197)}...` : message);

/**
 * Flattens an error's `.cause` chain into one readable string. Spec 19 §34's
 * "observability through Polyglot's own persisted state, not paid log
 * ingestion" only actually works if the persisted summary carries the real
 * underlying reason — a wrapped driver/query error's top-level `.message`
 * alone (e.g. drizzle's "Failed query: select ...") is nearly useless
 * without the `.cause` underneath it, and this Lambda has no CloudWatch
 * Logs permission (§34) to fall back on for that detail.
 */
export function describeErrorChain(error: unknown): string {
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
export function toRowPreviewInput(row: ImportRowPreview): CurriculumImportRowPreviewInput {
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

export type FreshImportResolution = {
  sourceSha256: string;
  previews: ImportRowPreview[];
  rowInputs: CurriculumImportRowPreviewInput[];
};

/**
 * Reads the source file from S3, parses it, and resolves every row against
 * *current* curriculum state. Throws `PreviewJobError("IMPORT_PARSE_FAILED", ...)`
 * for a bad file — the same error shape both jobs already handle.
 */
export async function resolveFreshImport(
  db: DbClient,
  storage: CurriculumImportStorage,
  { key, fileExtension, languageId }: { key: string; fileExtension: "csv" | "tsv"; languageId: string },
): Promise<FreshImportResolution> {
  const fileContent = await storage.getObjectText(key);
  // Spec 19 §21 — computed here rather than by the browser: the create-
  // import action knows the id/key before any bytes exist (§6), so the
  // checksum is only ever knowable once something has actually read the file.
  const sourceSha256 = createHash("sha256").update(fileContent, "utf8").digest("hex");
  const delimiter = fileExtension === "tsv" ? "\t" : ",";
  const parsed = parseVocabularyImportFile(fileContent, delimiter);
  if (!parsed.ok) {
    throw new PreviewJobError("IMPORT_PARSE_FAILED", describeParseError(parsed.error));
  }

  const validatedRows = parsed.rows.map((row, index) => validateVocabularyImportRow(row, index));
  const previews = await previewVocabularyImport(db, { languageId, validatedRows });

  return { sourceSha256, previews, rowInputs: previews.map(toRowPreviewInput) };
}
