import type { DbClient } from "@/db/client";
import { bulkImportVocabulary } from "@/domains/admin/bulk-import-service";
import type { ImportRowDecision } from "@/domains/admin/bulk-import-service";
import {
  markCurriculumImportCompleted,
  markCurriculumImportFailed,
  markCurriculumImportStarted,
  revertCurriculumImportForRevalidation,
} from "@/domains/admin/curriculum-import-service";
import { getCurriculumImportById, listCurriculumImportRows } from "@/domains/admin/curriculum-import-repository";
import type { CurriculumImportRowRecord } from "@/domains/admin/curriculum-import-types";
import { matchImportedVocabularyItems } from "@/domains/lexicon/lexicon-mapping-service";
import type { CurriculumImportStorage } from "@/providers/storage/types";

import { detectMaterialChange } from "./material-change";
import { describeErrorChain, errorCode, resolveFreshImport } from "./import-resolution";

/**
 * The commit job (spec 19 §11/§14/§48 step 15) — reused, never
 * reimplemented: the actual curriculum write is exactly
 * `bulk-import-service.ts`'s existing atomic `bulkImportVocabulary`, the
 * same function the synchronous Admin dialog and `runPreviewJob`'s sibling
 * already call. This file's only real job is §12's mandatory revalidation:
 * reload current state, re-resolve, and refuse to trust the confirmed
 * preview if anything material moved underneath it.
 */

export type CommitJobInput = { importId: string; actorUserId: string };

/** Commit needs every row to compare against, not one page — `curriculum_imports` caps at 5,000 rows (spec 19 §4), so this is bounded. */
async function loadAllRows(db: DbClient, importId: string): Promise<CurriculumImportRowRecord[]> {
  const all: CurriculumImportRowRecord[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCurriculumImportRows(db, { importId, cursor, limit: 500 });
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

/**
 * Takes a storage *factory*, not a constructed instance — unlike the
 * preview job, the commit message (spec 19 §11's small `{importId,
 * actorUserId}` envelope) doesn't carry a bucket name, so the bucket to
 * construct storage for is only known after this function has already
 * loaded the import record. A factory keeps this testable with a fake the
 * same way `runPreviewJob` is (pass one that ignores its argument and
 * returns the same fake regardless of bucket).
 */
export async function runCommitJob(
  db: DbClient,
  createStorage: (bucket: string) => CurriculumImportStorage,
  { importId, actorUserId }: CommitJobInput,
): Promise<void> {
  const importRecord = await getCurriculumImportById(db, importId);
  if (!importRecord) {
    throw new Error(`No curriculum_imports row exists for id "${importId}".`);
  }
  const storage = createStorage(importRecord.s3Bucket);

  // Idempotent no-op once this import has reached a state a duplicate
  // COMMIT_IMPORT delivery should never disturb (spec 19 §11/§21 —
  // "receiving the same SQS message multiple times must never duplicate
  // curriculum writes"). `failed` is deliberately *not* included here: SQS's
  // own automatic redelivery of the same message (§22) must still be able to
  // retry a commit whose previous attempt failed, and this Lambda has no
  // other way to distinguish "a fresh redelivery" from "an admin's manual
  // retry" — both look identical from here, which is fine, since either one
  // retrying is exactly the desired behavior.
  if (importRecord.status === "completed" || importRecord.status === "needs_review" || importRecord.status === "ready_to_import") return;

  try {
    const fileExtension = importRecord.fileExtension as "csv" | "tsv";
    const [{ previews, rowInputs }, storedRows] = await Promise.all([
      resolveFreshImport(db, storage, { key: importRecord.s3Key, fileExtension, languageId: importRecord.languageId }),
      loadAllRows(db, importId),
    ]);

    if (detectMaterialChange(storedRows, rowInputs)) {
      // Spec 19 §12/§13 — abort. No curriculum write happens on this path.
      await revertCurriculumImportForRevalidation(db, { importId, rows: rowInputs, sourceSha256: importRecord.sourceSha256 ?? undefined });
      return;
    }

    await markCurriculumImportStarted(db, importId); // queued_for_import -> importing, attempt_count++

    const skippedRowNumbers = new Set(storedRows.filter((row) => row.adminDisposition === "skip").map((row) => row.rowNumber));
    const decisions: ImportRowDecision[] = previews
      .filter((row) => row.fields !== null && !skippedRowNumbers.has(row.rowNumber))
      .map((row) => ({ fields: row.fields!, decision: "import" as const }));

    if (decisions.length > 0) {
      // One commit = one idempotency scope. `importId` is already a stable
      // UUID unique to this logical operation, reused across every retry of
      // the same commit (spec 19 §21's "curriculum-import:{importId}:commit:v1"
      // in spirit — the idempotency table's own (userId, operation, key)
      // uniqueness is what actually enforces it).
      const outcome = await bulkImportVocabulary(db, { languageId: importRecord.languageId, actorUserId, idempotencyKey: importId, rows: decisions });

      // Spec 19 §17 — dictionary matching follows successful curriculum
      // creation/update, vocabulary only, exactly like the synchronous
      // path's `bulkImportVocabularyAction`. Deliberately outside the outer
      // catch's failure path: `bulkImportVocabulary`'s transaction has
      // already committed by this point, so a matching failure must never
      // retroactively mark this import `failed` — that would both lie about
      // whether curriculum was written and, on the inevitable SQS retry,
      // send an already-committed row through fresh resolution again, where
      // it now resolves as `unchanged` instead of `create` and trips
      // `detectMaterialChange` for no real reason.
      const vocabularyItemIds = [...outcome.createdVocabularyItemIds, ...outcome.updatedVocabularyItemIds];
      if (vocabularyItemIds.length > 0) {
        await matchImportedVocabularyItems(db, vocabularyItemIds).catch(() => {});
      }
    }

    await markCurriculumImportCompleted(db, importId, { skippedCount: skippedRowNumbers.size });
  } catch (error) {
    const fullMessage = describeErrorChain(error);
    const summary = errorCode(fullMessage);
    await markCurriculumImportFailed(db, { importId, errorCode: "IMPORT_TRANSACTION_FAILED", errorSummary: summary }).catch(() => {});
    throw new Error(fullMessage);
  }
}
