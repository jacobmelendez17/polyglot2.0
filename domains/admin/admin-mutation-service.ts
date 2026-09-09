import { db } from "@/db/client";
import type { ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import { getRateLimiter } from "@/providers/rate-limit";
import { AdminError } from "@/lib/errors/admin-errors";

import * as accountReset from "./account-reset-service";
import type { ResetOwnAccountProgressServiceInput } from "./account-reset-service";
import * as bulkImport from "./bulk-import-service";
import type { BulkImportVocabularyServiceInput } from "./bulk-import-service";
import * as publication from "./publication-service";
import type {
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
