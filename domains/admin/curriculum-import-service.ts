import type { DbClient } from "@/db/client";
import { AdminError } from "@/lib/errors/admin-errors";

import { recordAuditEvent } from "./audit-repository";
import {
  archiveCurriculumImport as repoArchiveCurriculumImport,
  countUnresolvedRows,
  createCurriculumImport as repoCreateCurriculumImport,
  deleteCurriculumImport,
  incrementAttemptCount,
  lockCurriculumImportForUpdate,
  recordPreviewResult as repoRecordPreviewResult,
  setRowDisposition,
  setStatus,
  unarchiveCurriculumImport as repoUnarchiveCurriculumImport,
} from "./curriculum-import-repository";
import type { CreateCurriculumImportInput, CurriculumImportRecord, CurriculumImportRowPreviewInput } from "./curriculum-import-types";

/**
 * State-machine behavior around `curriculum_imports` (spec 19 §18, §48 step
 * 3). Every mutation here locks the import row first (`lockCurriculumImportForUpdate`)
 * and re-checks its current status before transitioning — the same reasoning
 * as `domains/decks`' row lock: two concurrent requests (an admin double
 * click, a retried Lambda invocation) must serialize rather than both
 * observe the same starting status and both apply their transition.
 *
 * This service does not resolve or mutate curriculum. It only tracks one
 * import's processing state; `bulk-import-service.ts` remains the sole owner
 * of `create`/`update`/`move`/`unchanged`/`blocked` resolution and the
 * actual curriculum write (spec 19 §2). Whoever drives the pipeline (today:
 * nothing yet: this ships ahead of the Lambda worker itself, see
 * `progress-tracker.md`) calls both: resolve rows via `bulk-import-service.ts`,
 * then persist that result here via `recordPreviewResult`/`confirmCurriculumImport`.
 */

export async function createCurriculumImport(db: DbClient, input: CreateCurriculumImportInput): Promise<CurriculumImportRecord> {
  return repoCreateCurriculumImport(db, input);
}

/** Called once the browser's direct-to-S3 upload is known to have happened — the object exists, and preview processing can be queued. */
export async function markCurriculumImportUploaded(db: DbClient, importId: string): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.status !== "uploading") return; // Already past this point — a duplicate S3 event, harmless (spec 19 §7).
  await setStatus(db, importId, "queued_for_preview", { uploadedAt: new Date() });
}

export async function markCurriculumImportPreviewStarted(db: DbClient, importId: string): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.status !== "queued_for_preview" && current.status !== "needs_review" && current.status !== "ready_to_import") {
    // Allow re-entry from needs_review/ready_to_import too — §12's commit-time revalidation re-runs preview from those states.
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", `Cannot start preview from status "${current.status}".`);
  }
  await setStatus(db, importId, "previewing", { previewStartedAt: new Date() });
}

/**
 * Persists a (re)computed preview and moves the import to `needs_review` or
 * `ready_to_import` — never asks the caller to decide which; that is a pure
 * function of whether any row still needs a disposition (spec 19 §9's "the
 * Confirm Import control must remain unavailable until every review-required
 * row has an explicit disposition").
 */
export async function recordCurriculumImportPreview(
  db: DbClient,
  { importId, rows, sourceSha256 }: { importId: string; rows: CurriculumImportRowPreviewInput[]; sourceSha256?: string },
): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.status !== "previewing") {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", `Cannot record a preview from status "${current.status}".`);
  }
  await repoRecordPreviewResult(db, { importId, rows, sourceSha256 });
}

export type ConfirmCurriculumImportResult = { confirmedPreviewVersion: number };

/**
 * The Admin confirmation gate (spec 19 §9/§10). Refuses unless every
 * blocked/needs-review row has an explicit disposition, and unless the
 * import is actually sitting in a confirmable status — confirming twice, or
 * confirming mid-preview, is a bug in the caller, not a retryable state.
 */
export async function confirmCurriculumImport(db: DbClient, { importId, actorUserId }: { importId: string; actorUserId: string }): Promise<ConfirmCurriculumImportResult> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.status !== "needs_review" && current.status !== "ready_to_import") {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", `This import isn't ready to confirm (status "${current.status}").`);
  }

  const unresolved = await countUnresolvedRows(db, importId);
  if (unresolved > 0) {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", `${unresolved} row(s) still need a decision before this import can be confirmed.`);
  }

  await setStatus(db, importId, "queued_for_import", { confirmedAt: new Date(), confirmedPreviewVersion: current.previewVersion });
  await recordAuditEvent(db, {
    actorUserId,
    action: "CURRICULUM_IMPORT_CONFIRMED",
    resourceType: "curriculum_import",
    resourceId: importId,
    correlationId: importId,
  });
  return { confirmedPreviewVersion: current.previewVersion };
}

/** V1's only row resolution (spec 19 §9): skip a blocked row so it never blocks confirmation. */
export async function resolveCurriculumImportRow(db: DbClient, { rowId }: { rowId: string }): Promise<void> {
  await setRowDisposition(db, rowId, "skip");
}

export async function markCurriculumImportStarted(db: DbClient, importId: string): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.status !== "queued_for_import") {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", `Cannot start committing from status "${current.status}".`);
  }
  await incrementAttemptCount(db, importId);
  await setStatus(db, importId, "importing", { importStartedAt: new Date() });
}

export async function markCurriculumImportCompleted(db: DbClient, importId: string): Promise<void> {
  await setStatus(db, importId, "completed", { completedAt: new Date() });
}

export async function markCurriculumImportFailed(db: DbClient, { importId, errorCode, errorSummary }: { importId: string; errorCode: string; errorSummary: string }): Promise<void> {
  await setStatus(db, importId, "failed", { lastErrorCode: errorCode, lastErrorSummary: errorSummary });
}

/** Returns a failed import to `queued_for_import` so retry logic can re-run the commit job (spec 19 §22). Does not reset `attemptCount` — a retry is a new attempt, not a fresh import. */
export async function retryCurriculumImport(db: DbClient, importId: string): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.status !== "failed") {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Only a failed import can be retried.");
  }
  await setStatus(db, importId, "queued_for_import");
}

export async function archiveCurriculumImport(db: DbClient, { importId, actorUserId }: { importId: string; actorUserId: string }): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (current.archivedAt) return; // Already archived — idempotent no-op, not an error.
  await repoArchiveCurriculumImport(db, importId, actorUserId);
  await recordAuditEvent(db, { actorUserId, action: "CURRICULUM_IMPORT_ARCHIVED", resourceType: "curriculum_import", resourceId: importId });
}

export async function unarchiveCurriculumImport(db: DbClient, { importId, actorUserId }: { importId: string; actorUserId: string }): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (!current.archivedAt) return;
  await repoUnarchiveCurriculumImport(db, importId);
  await recordAuditEvent(db, { actorUserId, action: "CURRICULUM_IMPORT_RESTORED", resourceType: "curriculum_import", resourceId: importId });
}

/**
 * Permanent history deletion (spec 19 §26). Only an archived import may be
 * deleted, and only its tracking rows go — curriculum created/changed by the
 * import is untouched (this function never touches `learning_items` or any
 * other curriculum table). The audit event is the "minimal immutable
 * tombstone" §26 requires: identifiers and the import's final state, never
 * the deleted row previews or the source file's content.
 *
 * Deleting the S3 source object itself is a separate, AWS-touching step not
 * yet wired up (see `progress-tracker.md` — this ships ahead of the S3/Lambda
 * units); this function only removes the database record.
 */
export async function permanentlyDeleteCurriculumImport(db: DbClient, { importId, actorUserId }: { importId: string; actorUserId: string }): Promise<void> {
  const current = await lockCurriculumImportForUpdate(db, importId);
  if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND", "This import no longer exists.");
  if (!current.archivedAt) {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Only an archived import can be permanently deleted.");
  }

  await recordAuditEvent(db, {
    actorUserId,
    action: "CURRICULUM_IMPORT_DELETED",
    resourceType: "curriculum_import",
    resourceId: importId,
    afterData: { sourceSha256: current.sourceSha256, finalStatus: current.status },
  });
  await deleteCurriculumImport(db, importId);
}
