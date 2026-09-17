import type { DbClient } from "@/db/client";
import {
  markCurriculumImportFailed,
  markCurriculumImportPreviewStarted,
  markCurriculumImportUploaded,
  recordCurriculumImportPreview,
} from "@/domains/admin/curriculum-import-service";
import { getCurriculumImportById } from "@/domains/admin/curriculum-import-repository";
import type { CurriculumImportStorage } from "@/providers/storage/types";
import { parseCurriculumImportObjectKey } from "@/providers/storage/curriculum-import-object-key";

import {
  describeErrorChain,
  errorCode,
  PreviewJobError,
  resolveFreshImport,
} from "./import-resolution";

/**
 * The preview job (spec 19 §7/§48 step 10) — reused, never reimplemented:
 * this calls exactly the same `previewVocabularyImport` the synchronous
 * Admin dialog calls today (`bulk-import-service.ts`), just invoked from an
 * SQS-triggered Lambda instead of a Server Action.
 */

export type PreviewJobInput = { bucket: string; key: string };

export async function runPreviewJob(
  db: DbClient,
  storage: CurriculumImportStorage,
  { key }: PreviewJobInput,
): Promise<void> {
  const parsedKey = parseCurriculumImportObjectKey(key);
  if (!parsedKey) {
    throw new Error(
      `Object key "${key}" is not a recognized curriculum-import source key.`,
    );
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

    const { sourceSha256, rowInputs } = await resolveFreshImport(db, storage, {
      key,
      fileExtension,
      languageId: importRecord.languageId,
    });

    await recordCurriculumImportPreview(db, {
      importId,
      rows: rowInputs,
      sourceSha256,
    });
  } catch (error) {
    const code =
      error instanceof PreviewJobError ? error.code : "IMPORT_PREVIEW_FAILED";
    const fullMessage = describeErrorChain(error);
    const summary = errorCode(fullMessage);
    // Best-effort — if Neon itself is unreachable this write can fail too,
    // in which case SQS retry/DLQ remains the safety net (spec 19 §35).
    await markCurriculumImportFailed(db, {
      importId,
      errorCode: code,
      errorSummary: summary,
    }).catch(() => {});
    // Rethrown with the full cause chain folded into the message (not just
    // the original error) — this Lambda has no CloudWatch Logs permission
    // (§34), so a synchronous `aws lambda invoke` and the persisted
    // `last_error_summary` above are the only two places this detail can
    // ever surface.
    throw new Error(fullMessage);
  }
}
