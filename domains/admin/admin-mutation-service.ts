import { randomUUID } from "node:crypto";

import { db } from "@/db/client";
import type { ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import { env } from "@/lib/env";
import { curriculumImportObjectKey, getCurriculumImportStorage } from "@/providers/storage";
import { getCurriculumImportQueue } from "@/providers/queue";
import { getRateLimiter } from "@/providers/rate-limit";
import { AdminError } from "@/lib/errors/admin-errors";

import * as accountReset from "./account-reset-service";
import type { ResetOwnAccountProgressServiceInput } from "./account-reset-service";
import * as bulkImport from "./bulk-import-service";
import type { BulkImportVocabularyServiceInput } from "./bulk-import-service";
import * as curriculumImport from "./curriculum-import-service";
import { getCurriculumImportById, listCurriculumImportRows } from "./curriculum-import-repository";
import * as publication from "./publication-service";
import type {
  ApplyDictionaryFieldsServiceInput,
  ExampleServiceInput,
  GrammarContentBlockServiceInput,
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

async function checkRateLimit(policy: "admin-mutation" | "admin-publish", userId: string): Promise<void> {
  const decision = await getRateLimiter().check({ policy, subject: userId });
  if (!decision.allowed) {
    throw new AdminError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
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
export async function applyDictionaryFieldsToItem(input: ApplyDictionaryFieldsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.applyDictionaryFieldsToItem(db, input);
}

export async function resetDictionaryFieldOverride(input: ResetDictionaryFieldServiceInput) {
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

export async function mutateGrammarContentBlock(input: GrammarContentBlockServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.mutateGrammarContentBlock(db, input);
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
  await checkRateLimit(input.status === "published" ? "admin-publish" : "admin-mutation", input.actorUserId);
  return publication.updateLevel(db, input);
}

export async function createVocabularyGroup(input: CreateVocabularyGroupServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.createVocabularyGroup(db, input);
}

export async function updateVocabularyGroup(input: UpdateVocabularyGroupServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.updateVocabularyGroup(db, input);
}

export async function reorderVocabularyGroups(input: ReorderVocabularyGroupsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.reorderVocabularyGroups(db, input);
}

export async function bulkArchiveItems(input: BulkArchiveItemsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.bulkArchiveItems(db, input);
}

export async function bulkMoveItems(input: BulkMoveItemsServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return publication.bulkMoveItems(db, input);
}

export async function bulkPublishPendingItems(input: BulkPublishPendingItemsServiceInput) {
  await checkRateLimit("admin-publish", input.actorUserId);
  return publication.bulkPublishPendingItems(db, input);
}

export async function previewVocabularyImport(input: PreviewVocabularyImportServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return bulkImport.previewVocabularyImport(db, { languageId: input.languageId, validatedRows: input.validatedRows });
}

export async function bulkImportVocabulary(input: BulkImportVocabularyServiceInput) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return bulkImport.bulkImportVocabulary(db, input);
}

export async function resetOwnAccountProgress(input: ResetOwnAccountProgressServiceInput) {
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

export type CreateCurriculumImportUploadResult = { importId: string; uploadUrl: string };

export async function createCurriculumImportUpload(input: CreateCurriculumImportUploadInput): Promise<CreateCurriculumImportUploadResult> {
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
    contentType: input.fileExtension === "csv" ? "text/csv" : "text/tab-separated-values",
  });

  return { importId: record.id, uploadUrl: presigned.url };
}

export async function getCurriculumImportStatus(importId: string) {
  return getCurriculumImportById(db, importId);
}

export async function listCurriculumImportRowsForReview(input: { importId: string; cursor?: string | null; limit: number }) {
  return listCurriculumImportRows(db, input);
}

export async function resolveCurriculumImportRow(input: { rowId: string; actorUserId: string }) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  return curriculumImport.resolveCurriculumImportRow(db, { rowId: input.rowId });
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
export async function confirmCurriculumImport(input: { importId: string; actorUserId: string }) {
  await checkRateLimit("admin-mutation", input.actorUserId);
  const result = await curriculumImport.confirmCurriculumImport(db, input);
  await getCurriculumImportQueue().sendCommitJob({ importId: input.importId, actorUserId: input.actorUserId });
  return result;
}
