import { randomUUID } from "node:crypto";

import { db } from "@/db/client";
import type { ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import { env } from "@/lib/env";
import {
  curriculumImportObjectKey,
  getCurriculumImportStorage,
} from "@/providers/storage";
import { getCurriculumImportQueue } from "@/providers/queue";
import { getRateLimiter } from "@/providers/rate-limit";
import { AdminError } from "@/lib/errors/admin-errors";

import * as userRole from "./user-role-service";
import type { ChangeUserRoleServiceInput } from "./user-role-service";
import * as accountReset from "./account-reset-service";
import type { ResetOwnAccountProgressServiceInput } from "./account-reset-service";
import * as bulkImport from "./bulk-import-service";
import type { BulkImportVocabularyServiceInput } from "./bulk-import-service";
import * as curriculumImport from "./curriculum-import-service";
import {
  getCurriculumImportById,
  listArchivedCurriculumImports,
  listCurriculumImportRows,
  listCurriculumImports,
} from "./curriculum-import-repository";
import { listAdminUsers as listAdminUsersFromRepository } from "@/domains/users/admin-user-repository";
import type { ListAdminUsersInput } from "@/domains/users/admin-user-types";
import * as publication from "./publication-service";
import type {
  ApplyDictionaryFieldsServiceInput,
  ExampleServiceInput,
  GrammarContentBlockServiceInput,
  SaveGrammarContentBlocksServiceInput,
  ItemResourceServiceInput,
  UsageContextServiceInput,
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
  ResetDictionaryFieldServiceInput,
  ReorderItemsServiceInput,
  ReorderVocabularyGroupsServiceInput,
  UpdateItemServiceInput,
  UpdateLevelServiceInput,
  UpdateVocabularyGroupServiceInput,
} from "./publication-service";

export type PreviewVocabularyImportServiceInput = {
  languageId: string;
  actorUserId: string;
  validatedRows: ValidatedImportRow[];
};

/**
 * Binds the real app database and rate limiter to `publication-service.ts`'s
 * and `bulk-import-service.ts`'s injectable orchestration functions — see
 * `domains/srs/review-service.ts` for the identical pattern. Not guarded
 * with `import "server-only"` directly — importing `db`/the rate-limit
 * provider already carries that guard transitively.
 */

async function checkRateLimit(
  policy:
    | "admin-mutation"
    | "admin-publish"
    | "admin-role-change"
    | "admin-user-search",
  userId: string,
): Promise<void> {
  const decision = await getRateLimiter().check({ policy, subject: userId });
  if (!decision.allowed) {
    throw new AdminError(
      "RATE_LIMITED",
      `Please slow down and try again in ${decision.retryAfterSeconds}s.`,
      // Structured, so an HTTP caller can answer with a real `Retry-After`
      // header instead of parsing the sentence above.
      { retryAfterSeconds: decision.retryAfterSeconds },
    );
  }
}

export async function createItem(input: CreateItemServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.createItem(db, input);
}

export async function updateItem(input: UpdateItemServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.updateItem(db, input);
}

/**
 * Spec 16 follow-up — promotes a confirmed dictionary match into the item.
 * Rate limited as an ordinary admin mutation: it is one, and it is reachable
 * from every mapping action in the dictionary review queue.
 */
export async function applyDictionaryFieldsToItem(
  input: ApplyDictionaryFieldsServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.applyDictionaryFieldsToItem(db, input);
}

export async function resetDictionaryFieldOverride(
  input: ResetDictionaryFieldServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.resetDictionaryFieldOverride(db, input);
}

export async function mutateUsageContext(input: UsageContextServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.mutateUsageContext(db, input);
}

export async function mutateItemExample(input: ExampleServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.mutateItemExample(db, input);
}

export async function mutateGrammarContentBlock(
  input: GrammarContentBlockServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.mutateGrammarContentBlock(db, input);
}

export async function saveGrammarContentBlocks(
  input: SaveGrammarContentBlocksServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.saveGrammarContentBlocks(db, input);
}

export async function mutateItemResource(input: ItemResourceServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.mutateItemResource(db, input);
}

export async function publishItem(input: PublishItemServiceInput) {
  await checkRateLimit("admin-publish", input.actorUserId);
  return publication.publishItem(db, input);
}

export async function archiveItem(input: ArchiveItemServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.archiveItem(db, input);
}

export async function deleteItem(input: DeleteItemServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.deleteItem(db, input);
}

export async function moveItem(input: MoveItemServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.moveItem(db, input);
}

export async function reorderItems(input: ReorderItemsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.reorderItems(db, input);
}

export async function createLevel(input: CreateLevelServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.createLevel(db, input);
}

export async function updateLevel(input: UpdateLevelServiceInput) {
  await checkRateLimit(
    input.status === "published" ? "admin-publish" : "admin-mutation",
    input.actorUserId,
  );
  return publication.updateLevel(db, input);
}

export async function createVocabularyGroup(
  input: CreateVocabularyGroupServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.createVocabularyGroup(db, input);
}

export async function updateVocabularyGroup(
  input: UpdateVocabularyGroupServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.updateVocabularyGroup(db, input);
}

export async function reorderVocabularyGroups(
  input: ReorderVocabularyGroupsServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.reorderVocabularyGroups(db, input);
}

/**
 * Spec 26 Unit 6 — change another real account's role. Rate limited on its own,
 * tight policy: of everything the console does it is the most privileged.
 */
export async function changeUserRole(input: ChangeUserRoleServiceInput) {
  await checkRateLimit("admin-role-change", input.actorUserId);
  return userRole.changeUserRole(db, input);
}

/**
 * Spec 26 Unit 6 — the account list. Every read is counted: knowing who has an
 * account is itself something to enumerate carefully. The caller has already
 * been authorized (`canManageUsers`); `actorUserId` is only whose budget this is.
 */
export async function listAdminUsers(
  input: ListAdminUsersInput & { actorUserId: string },
) {
  const { actorUserId, ...query } = input;
  await checkRateLimit("admin-user-search", actorUserId);
  return listAdminUsersFromRepository(db, query);
}

export async function bulkArchiveItems(input: BulkArchiveItemsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.bulkArchiveItems(db, input);
}

export async function bulkMoveItems(input: BulkMoveItemsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.bulkMoveItems(db, input);
}

export async function bulkPublishPendingItems(
  input: BulkPublishPendingItemsServiceInput,
) {
  await checkRateLimit("admin-publish", input.actorUserId);
  return publication.bulkPublishPendingItems(db, input);
}

export async function previewVocabularyImport(
  input: PreviewVocabularyImportServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return bulkImport.previewVocabularyImport(db, {
    languageId: input.languageId,
    validatedRows: input.validatedRows,
  });
}

export async function bulkImportVocabulary(
  input: BulkImportVocabularyServiceInput,
) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return bulkImport.bulkImportVocabulary(db, input);
}

export async function resetOwnAccountProgress(
  input: ResetOwnAccountProgressServiceInput,
) {
  await checkRateLimit("admin-mutation", input.userId);
  return accountReset.resetOwnAccountProgress(db, input);
}

/**
 * Spec 19 §48 steps 12-13 — binds the real `db`/storage/rate limiter to
 * `curriculum-import-service.ts`'s injectable functions, the same pattern
 * as `bulkImportVocabulary` above. `createCurriculumImportUpload` is the
 * one function that needs more than just `db`: it mints the id (the S3 key
 * is derived from it before the row exists, §6) and asks the storage
 * provider for both the bucket name and a presigned upload URL.
 */

export type CreateCurriculumImportUploadInput = {
  languageId: string;
  actorUserId: string;
  originalFilename: string;
  fileExtension: "csv" | "tsv";
};

export type CreateCurriculumImportUploadResult = {
  importId: string;
  uploadUrl: string;
};

export async function createCurriculumImportUpload(
  input: CreateCurriculumImportUploadInput,
): Promise<CreateCurriculumImportUploadResult> {
  await checkRateLimit("admin-mutation", input.actorUserId);
  const id = randomUUID();
  const storage = getCurriculumImportStorage();
  const key = curriculumImportObjectKey(id, input.fileExtension);

  const record = await curriculumImport.createCurriculumImport(db, {
    id,
    languageId: input.languageId,
    environment: env.APP_ENV,
    uploadedByUserId: input.actorUserId,
    originalFilename: input.originalFilename,
    fileExtension: input.fileExtension,
    s3Bucket: storage.bucketName,
    s3Key: key,
  });

  const presigned = await storage.createPresignedUploadUrl({
    key,
    contentType:
      input.fileExtension === "csv" ? "text/csv" : "text/tab-separated-values",
  });

  return { importId: record.id, uploadUrl: presigned.url };
}

export async function getCurriculumImportStatus(importId: string) {
  return getCurriculumImportById(db, importId);
}

export async function listCurriculumImportRowsForReview(input: {
  importId: string;
  cursor?: string | null;
  limit: number;
}) {
  return listCurriculumImportRows(db, input);
}

export async function resolveCurriculumImportRow(input: {
  rowId: string;
  disposition: "skip" | "approve_move";
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return curriculumImport.resolveCurriculumImportRow(db, {
    rowId: input.rowId,
    disposition: input.disposition,
  });
}

/**
 * Spec 25 §10.2 — same "domain write, then enqueue" split as
 * `confirmCurriculumImport`/`retryCurriculumImport`: the correction is
 * durably saved first (`curriculumImport.reviseCurriculumImportRow`), and
 * only then does the retrigger message go out, so a mid-flight failure never
 * leaves an SQS message racing ahead of a correction the database hasn't
 * actually committed yet.
 */
export async function reviseCurriculumImportRow(input: {
  rowId: string;
  corrections: Partial<Record<string, string>>;
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  const { s3Bucket, s3Key } = await curriculumImport.reviseCurriculumImportRow(
    db,
    { rowId: input.rowId, corrections: input.corrections },
  );
  await getCurriculumImportQueue().sendPreviewJob({
    bucket: s3Bucket,
    key: s3Key,
  });
}

/** Spec 25 §14.3's "Publish All Eligible Imported Changes" — rate limited as a publish action (`admin-publish`), matching `bulkPublishPendingItems`/`publishItem` above, not the lighter `admin-mutation` policy every other import-tracking action here uses. */
export async function publishImportedDraftChanges(input: {
  importId: string;
  actorUserId: string;
  idempotencyKey: string;
}) {
  await checkRateLimit("admin-publish", input.actorUserId);
  return curriculumImport.publishImportedDraftChanges(db, input);
}

/**
 * Confirming persists the state-machine transition first (spec 19 §9's gate
 * — refuses if any row still needs a disposition), then enqueues the
 * COMMIT_IMPORT message (§11) only once that's durably committed. Enqueuing
 * before the DB write landed would risk a Lambda racing to read a status
 * the confirm transaction hadn't actually saved yet; the reverse order —
 * commit first, send second — means the worst case of a mid-flight failure
 * is a `queued_for_import` import with no message in flight yet, which
 * spec 19 §22's retry path (and a future manual "resend" action) can always
 * recover, rather than a message racing ahead of the state it depends on.
 */
export async function confirmCurriculumImport(input: {
  importId: string;
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  const result = await curriculumImport.confirmCurriculumImport(db, input);
  await getCurriculumImportQueue().sendCommitJob({
    importId: input.importId,
    actorUserId: input.actorUserId,
  });
  return result;
}

/**
 * Spec 19 §22's "Retry Import" — the domain-level `retryCurriculumImport`
 * (unit 3) only flips `failed` back to `queued_for_import`; without also
 * re-sending the COMMIT_IMPORT message here, a manual retry would move the
 * status but nothing would ever consume it, identically to `confirmCurriculumImport`
 * above needing both halves together.
 */
export async function retryCurriculumImport(input: {
  importId: string;
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  await curriculumImport.retryCurriculumImport(db, input.importId);
  await getCurriculumImportQueue().sendCommitJob({
    importId: input.importId,
    actorUserId: input.actorUserId,
  });
}

export async function listActiveCurriculumImports(input: {
  languageId: string;
  cursor?: string | null;
  limit: number;
}) {
  return listCurriculumImports(db, input);
}

export async function listArchivedCurriculumImportsForHistory(input: {
  languageId: string;
  cursor?: string | null;
  limit: number;
}) {
  return listArchivedCurriculumImports(db, input);
}

/**
 * Archiving, restoring and permanently deleting an import (spec 26 Unit 8) each
 * change the import and write the audit trail, and each begins by locking the
 * import's row (`lockCurriculumImportForUpdate`) so that two requests for the
 * same import take turns rather than both acting on the same stale view. A row
 * lock lasts only as long as the caller's transaction, so each runs in one:
 * outside it the lock is released the moment the `SELECT ... FOR UPDATE`
 * returns, and two requests sent at once — a double click, a retried request,
 * two Admins — would both archive it and both write the audit event.
 */
export async function archiveCurriculumImport(input: {
  importId: string;
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return db.transaction((tx) =>
    curriculumImport.archiveCurriculumImport(tx, input),
  );
}

export async function unarchiveCurriculumImport(input: {
  importId: string;
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return db.transaction((tx) =>
    curriculumImport.unarchiveCurriculumImport(tx, input),
  );
}

/**
 * Spec 19 §26 — permanent deletion also removes the remaining S3 source
 * object, once the DB-level deletion (and its audit tombstone) has already
 * landed. Best-effort on the S3 side: the object also expires via the
 * bucket's own 30-day lifecycle rule regardless, so a delete failure here
 * leaves nothing worse than "slightly early" would have looked like.
 */
export async function permanentlyDeleteCurriculumImport(input: {
  importId: string;
  actorUserId: string;
}) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  const record = await getCurriculumImportById(db, input.importId);
  await db.transaction((tx) =>
    curriculumImport.permanentlyDeleteCurriculumImport(tx, input),
  );
  if (record) {
    // Best effort in full: the history is already gone, so nothing here may
    // fail the command — not the delete, and not building the storage client
    // (which throws when `IMPORT_BUCKET` is not configured).
    try {
      await getCurriculumImportStorage().deleteObject(record.s3Key);
    } catch {
      // The bucket's own lifecycle rule expires the object regardless.
    }
  }
}
