import type { DbClient } from "@/db/client";
import {
  archiveLearningItem as repoArchiveLearningItem,
  attemptPermanentDelete,
  createLearningItem as repoCreateLearningItem,
  createLevel as repoCreateLevel,
  createVocabularyGroup as repoCreateVocabularyGroup,
  getAcceptedAnswers,
  getDraft,
  getVocabularyDictionaryFields,
  getDuplicateCandidateRows,
  getLevelTargets,
  getLevelValidationCounts,
  getNextPosition,
  lockLearningItemForEdit,
  moveLearningItem as repoMoveLearningItem,
  publishDraft as repoPublishDraft,
  publishPendingItem,
  reorderLearningItems as repoReorderLearningItems,
  reorderVocabularyGroups as repoReorderVocabularyGroups,
  saveDraft as repoSaveDraft,
  updateLearningItemDirect,
  updateLevel as repoUpdateLevel,
  updateVocabularyDictionaryFields,
  updateVocabularyGroup as repoUpdateVocabularyGroup,
} from "@/domains/curriculum/curriculum-mutation-repository";
import { findDuplicateCandidates } from "@/domains/curriculum/curriculum-duplicate-detection";
import type { DictionarySuppliedVocabularyFields } from "@/domains/curriculum/curriculum-mutation-repository";
import type {
  ArchiveLearningItemInput,
  BulkArchiveLearningItemsInput,
  BulkMoveLearningItemsInput,
  BulkPublishPendingItemsInput,
  CreateLearningItemInput,
  CreateLevelInput,
  CreateVocabularyGroupInput,
  DeleteLearningItemInput,
  DeleteLearningItemResult,
  MoveLearningItemInput,
  PublishLearningItemInput,
  ReorderLearningItemsInput,
  ReorderVocabularyGroupsInput,
  UpdateLearningItemInput,
  UpdateLevelInput,
  UpdateVocabularyGroupInput,
} from "@/domains/curriculum/curriculum-mutation-types";
import { evaluateLevelValidation } from "@/domains/curriculum/curriculum-validation-config";
import { withIdempotency } from "@/domains/idempotency";
import { AdminError } from "@/lib/errors/admin-errors";

import { recordAuditEvent } from "./audit-repository";
import { invalidateCurriculumCache } from "./cache-invalidation";

/**
 * Admin curriculum-mutation orchestration (spec 11 rewrite) — the
 * `domains/admin` half of `domains/srs/review-completion.ts`'s role:
 * composes `domains/curriculum`'s raw repository functions (a cross-domain
 * repository-to-repository call, matching this codebase's established
 * pattern — see progress-tracker.md's Architecture Decisions) with
 * idempotency, audit recording, and cache invalidation, all inside the one
 * transaction `withIdempotency` opens. Authentication, authorization
 * (`canManageCurriculum`), and rate-limiting happen in the caller
 * (`admin-mutation-service.ts` — rate-limiting is server-only-guarded, so
 * it can't live in this `DbClient`-injectable, testable module, same
 * constraint as every prior spec's identical decision).
 *
 * A brand-new item needs no duplicate-of/homonym field on its own audit
 * event unless a duplicate was actually found and approved — the
 * `approvedAsHomonymOf` field on the input is `null`/absent in the normal
 * case.
 */

function itemResourceType(type: "vocabulary" | "grammar"): string {
  return type === "vocabulary" ? "vocabulary_item" : "grammar_item";
}

async function checkDuplicates(
  db: DbClient,
  languageId: string,
  type: "vocabulary" | "grammar",
  displayForm: string,
  excludeLearningItemId: string | undefined,
  approvedAsHomonymOf: string | null | undefined,
) {
  const candidateRows = await getDuplicateCandidateRows(db, languageId, type, excludeLearningItemId);
  const matches = findDuplicateCandidates(displayForm, candidateRows);
  if (matches.length > 0 && !approvedAsHomonymOf) {
    throw new AdminError("DUPLICATE_ITEM", undefined, { candidates: matches });
  }
}

export type CreateItemServiceInput = CreateLearningItemInput & { idempotencyKey: string };

export async function createItem(db: DbClient, input: CreateItemServiceInput): Promise<{ learningItemId: string }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.create-item",
      key: input.idempotencyKey,
      payload: { languageId: input.languageId, levelId: input.levelId, type: input.type, fields: input.fields },
    },
    async (tx) => {
      const displayForm = input.type === "vocabulary" ? input.fields.term : input.fields.structure;
      await checkDuplicates(tx, input.languageId, input.type, displayForm, undefined, input.approvedAsHomonymOf);

      // Appended at the end of this level+type's ordering — computed here,
      // not supplied by the caller, since a hardcoded/guessed position
      // would collide with `learning_items_level_type_position_key`'s
      // unique constraint the moment a second item was ever created in the
      // same level+type.
      const position = await getNextPosition(tx, input.levelId, input.type);
      const base = { languageId: input.languageId, levelId: input.levelId, position, lessonPriority: position };
      const learningItemId =
        input.type === "vocabulary"
          ? await repoCreateLearningItem(tx, { ...base, type: "vocabulary", fields: input.fields })
          : await repoCreateLearningItem(tx, { ...base, type: "grammar", fields: input.fields });

      if (input.approvedAsHomonymOf) {
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "DUPLICATE_APPROVED",
          resourceType: itemResourceType(input.type),
          resourceId: learningItemId,
          afterData: { approvedAsHomonymOf: input.approvedAsHomonymOf },
        });
      }
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_CREATED",
        resourceType: itemResourceType(input.type),
        resourceId: learningItemId,
        afterData: input.fields,
      });

      return { learningItemId };
    },
  );
}

export type UpdateItemServiceInput = UpdateLearningItemInput & { idempotencyKey: string };

export async function updateItem(db: DbClient, input: UpdateItemServiceInput): Promise<{ savedAsDraft: boolean }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.update-item",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, type: input.type, fields: input.fields },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.status === "archived") {
        throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Archived items cannot be edited.");
      }
      if (locked.type !== input.type) {
        throw new AdminError("CURRICULUM_VALIDATION_FAILED", "An item's type cannot change after creation.");
      }

      const displayForm = input.type === "vocabulary" ? input.fields.term : input.fields.structure;
      await checkDuplicates(tx, locked.languageId, input.type, displayForm, input.learningItemId, input.approvedAsHomonymOf);

      const beforeAnswers = await getAcceptedAnswers(tx, input.learningItemId);
      const savedAsDraft = locked.status === "published";
      const itemData = input.type === "vocabulary" ? { type: "vocabulary" as const, fields: input.fields } : { type: "grammar" as const, fields: input.fields };

      if (savedAsDraft) {
        await repoSaveDraft(tx, {
          learningItemId: input.learningItemId,
          baseVersion: locked.version,
          createdBy: input.actorUserId,
          data: itemData,
        });
      } else {
        await updateLearningItemDirect(tx, input.learningItemId, itemData);
      }

      if (input.approvedAsHomonymOf) {
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "DUPLICATE_APPROVED",
          resourceType: itemResourceType(input.type),
          resourceId: input.learningItemId,
          afterData: { approvedAsHomonymOf: input.approvedAsHomonymOf },
        });
      }
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_UPDATED",
        resourceType: itemResourceType(input.type),
        resourceId: input.learningItemId,
        beforeData: { acceptedAnswers: beforeAnswers },
        afterData: { fields: input.fields, savedAsDraft },
      });

      return { savedAsDraft };
    },
  );
}

export type PublishItemServiceInput = PublishLearningItemInput & { idempotencyKey: string };

export async function publishItem(db: DbClient, input: PublishItemServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.publish-item",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, expectedVersion: input.expectedVersion },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.version !== input.expectedVersion) throw new AdminError("ADMIN_EDIT_CONFLICT");
      if (locked.status === "archived") {
        throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Archived items cannot be published.");
      }

      if (locked.status === "pending") {
        await publishPendingItem(tx, input.learningItemId);
      } else {
        const draft = await getDraft(tx, input.learningItemId);
        if (!draft) {
          throw new AdminError("CURRICULUM_VALIDATION_FAILED", "There are no unpublished changes to publish.");
        }
        await repoPublishDraft(tx, input.learningItemId, draft.data);
      }

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_PUBLISHED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        beforeData: { version: locked.version },
      });
      invalidateCurriculumCache(locked.languageId);
    },
  );
}

export type ArchiveItemServiceInput = ArchiveLearningItemInput & { idempotencyKey: string };

export async function archiveItem(db: DbClient, input: ArchiveItemServiceInput): Promise<void> {
  return withIdempotency(
    db,
    { userId: input.actorUserId, operation: "admin.curriculum.archive-item", key: input.idempotencyKey, payload: { learningItemId: input.learningItemId } },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

      await repoArchiveLearningItem(tx, input.learningItemId);
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_ARCHIVED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        reason: input.reason,
      });
      invalidateCurriculumCache(locked.languageId);
    },
  );
}


export type ApplyDictionaryFieldsServiceInput = {
  learningItemId: string;
  actorUserId: string;
  idempotencyKey: string;
  fields: DictionarySuppliedVocabularyFields;
};

export type ApplyDictionaryFieldsResult = { applied: boolean; savedAsDraft: boolean };

/**
 * Promotes a confirmed dictionary match's values into the curriculum item
 * itself (user decision, 2026-09-09 — recorded in `architecture.md`'s
 * Lexicon section, which previously said dictionary data is never written
 * into curriculum fields at all).
 *
 * Lives here, in the domain that owns curriculum mutations, rather than in
 * `domains/lexicon`: the lexicon supplies values and never writes them. The
 * Admin dictionary actions compose the two, which is what an action layer is
 * for.
 *
 * Follows `updateItem`'s status rule exactly rather than inventing a second
 * one — a published item's live rows are never edited in place, so the
 * promotion lands in that item's draft and reaches learners only when an
 * admin publishes it. A pending or draft item is written directly.
 *
 * The audit event carries the previous values, which is the only way back:
 * approving is not reversible by un-approving, since the authored text it
 * replaced is gone from the row.
 */
export async function applyDictionaryFieldsToItem(
  db: DbClient,
  input: ApplyDictionaryFieldsServiceInput,
): Promise<ApplyDictionaryFieldsResult> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.apply-dictionary-fields",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, fields: input.fields },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.type !== "vocabulary") {
        // Grammar has no dictionary integration at all (spec 12). Reaching
        // here means a caller resolved the wrong item, not that there is
        // nothing to do — so it is an error, not a silent no-op.
        throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Only vocabulary items have dictionary data.");
      }
      if (locked.status === "archived") {
        throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Archived items cannot be edited.");
      }

      const current = await getVocabularyDictionaryFields(tx, input.learningItemId);
      if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

      const next = {
        partOfSpeech: input.fields.partOfSpeech ?? current.partOfSpeech,
        definition: input.fields.definition ?? current.definition,
        ipa: input.fields.ipa ?? current.ipa,
      };
      const unchanged =
        next.partOfSpeech === current.partOfSpeech && next.definition === current.definition && next.ipa === current.ipa;
      // Nothing to record and nothing to write — an admin re-opening an
      // already-applied item should not accumulate identical audit events.
      if (unchanged) return { applied: false, savedAsDraft: false };

      const savedAsDraft = locked.status === "published";

      if (savedAsDraft) {
        const acceptedAnswers = await getAcceptedAnswers(tx, input.learningItemId);
        await repoSaveDraft(tx, {
          learningItemId: input.learningItemId,
          baseVersion: locked.version,
          createdBy: input.actorUserId,
          data: {
            type: "vocabulary",
            fields: {
              vocabularyGroupId: current.vocabularyGroupId,
              term: current.term,
              primaryMeaning: current.primaryMeaning,
              article: current.article,
              pronunciation: current.pronunciation,
              context: current.context,
              creatorNotes: current.creatorNotes,
              acceptedAnswers: acceptedAnswers.map((answer) => ({ side: answer.side, value: answer.value })),
              ...next,
            },
          },
        });
      } else {
        await updateVocabularyDictionaryFields(tx, input.learningItemId, next);
      }

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_UPDATED",
        resourceType: "vocabulary_item",
        resourceId: input.learningItemId,
        beforeData: { partOfSpeech: current.partOfSpeech, definition: current.definition, ipa: current.ipa },
        afterData: { ...next, source: "dictionary", savedAsDraft },
      });
      invalidateCurriculumCache(locked.languageId);

      return { applied: true, savedAsDraft };
    },
  );
}

export type DeleteItemServiceInput = DeleteLearningItemInput & { idempotencyKey: string };

/** Tries a permanent delete; falls back to archive when referential integrity blocks it (spec 11 rewrite's "Archive/Delete"). */
export async function deleteItem(db: DbClient, input: DeleteItemServiceInput): Promise<DeleteLearningItemResult> {
  return withIdempotency(
    db,
    { userId: input.actorUserId, operation: "admin.curriculum.delete-item", key: input.idempotencyKey, payload: { learningItemId: input.learningItemId } },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

      const outcome = await attemptPermanentDelete(tx, input.learningItemId);
      if (outcome === "deleted") {
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_DELETED",
          resourceType: itemResourceType(locked.type),
          resourceId: input.learningItemId,
        });
        invalidateCurriculumCache(locked.languageId);
        return { outcome: "deleted" };
      }

      const reason = "This item has existing learner progress and cannot be permanently deleted. It will be archived instead.";
      await repoArchiveLearningItem(tx, input.learningItemId);
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_ARCHIVED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        reason,
      });
      invalidateCurriculumCache(locked.languageId);
      return { outcome: "archived", reason };
    },
  );
}

export type MoveItemServiceInput = MoveLearningItemInput & { idempotencyKey: string };

export async function moveItem(db: DbClient, input: MoveItemServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.move-item",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, levelId: input.levelId, vocabularyGroupId: input.vocabularyGroupId },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

      await repoMoveLearningItem(tx, {
        learningItemId: input.learningItemId,
        type: locked.type,
        levelId: input.levelId,
        vocabularyGroupId: input.vocabularyGroupId,
      });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_MOVED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        beforeData: { levelId: locked.levelId },
        afterData: { levelId: input.levelId ?? locked.levelId, vocabularyGroupId: input.vocabularyGroupId },
      });
      invalidateCurriculumCache(locked.languageId);
    },
  );
}

export type ReorderItemsServiceInput = ReorderLearningItemsInput & { idempotencyKey: string };

export async function reorderItems(db: DbClient, input: ReorderItemsServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.reorder-items",
      key: input.idempotencyKey,
      payload: { levelId: input.levelId, type: input.type, orderedLearningItemIds: input.orderedLearningItemIds },
    },
    async (tx) => {
      await repoReorderLearningItems(tx, input.levelId, input.type, input.orderedLearningItemIds);
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_REORDERED",
        resourceType: "level",
        resourceId: input.levelId,
        afterData: { type: input.type, orderedLearningItemIds: input.orderedLearningItemIds },
      });
    },
  );
}

// --- Levels management (spec 11 rewrite's "Levels Management") ---

export type CreateLevelServiceInput = CreateLevelInput & { idempotencyKey: string };

export async function createLevel(db: DbClient, input: CreateLevelServiceInput): Promise<{ levelId: string }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.create-level",
      key: input.idempotencyKey,
      payload: { languageId: input.languageId, levelNumber: input.levelNumber, name: input.name },
    },
    async (tx) => {
      const levelId = await repoCreateLevel(tx, { languageId: input.languageId, levelNumber: input.levelNumber, name: input.name });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "LEVEL_CREATED",
        resourceType: "level",
        resourceId: levelId,
        afterData: { languageId: input.languageId, levelNumber: input.levelNumber, name: input.name },
      });
      return { levelId };
    },
  );
}

export type UpdateLevelServiceInput = UpdateLevelInput & { idempotencyKey: string };

/** Rejects `status: "published"` unless `evaluateLevelValidation` reports every configured curriculum count satisfied (spec 11 rewrite: "Publishing should fail if mandatory Level validation is not satisfied"). */
export async function updateLevel(db: DbClient, input: UpdateLevelServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.update-level",
      key: input.idempotencyKey,
      payload: { levelId: input.levelId, name: input.name, status: input.status, targets: input.targets },
    },
    async (tx) => {
      if (input.status === "published") {
        const counts = await getLevelValidationCounts(tx, input.levelId);
        // Resolved against the level's *own* targets, including any this very
        // request is setting — an admin lowering a target and publishing in
        // one save must be validated against the new target, not the old one.
        const storedTargets = await getLevelTargets(tx, input.levelId);
        const validation = evaluateLevelValidation(counts, { ...storedTargets, ...(input.targets ?? {}) });
        if (!validation.allSatisfied) {
          throw new AdminError("CURRICULUM_VALIDATION_FAILED", "This level does not yet meet the minimum curriculum requirements to publish.", { validation });
        }
      }

      await repoUpdateLevel(tx, input.levelId, { name: input.name, status: input.status, targets: input.targets });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "LEVEL_UPDATED",
        resourceType: "level",
        resourceId: input.levelId,
        afterData: { name: input.name, status: input.status, targets: input.targets },
      });
    },
  );
}

// --- Vocabulary groups/themes management (spec 11 rewrite's "Vocabulary Groups / Themes") ---

export type CreateVocabularyGroupServiceInput = CreateVocabularyGroupInput & { idempotencyKey: string };

export async function createVocabularyGroup(db: DbClient, input: CreateVocabularyGroupServiceInput): Promise<{ groupId: string }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.create-group",
      key: input.idempotencyKey,
      payload: { levelId: input.levelId, languageId: input.languageId, name: input.name },
    },
    async (tx) => {
      const groupId = await repoCreateVocabularyGroup(tx, { levelId: input.levelId, languageId: input.languageId, name: input.name });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "GROUP_CREATED",
        resourceType: "vocabulary_group",
        resourceId: groupId,
        afterData: { levelId: input.levelId, name: input.name },
      });
      return { groupId };
    },
  );
}

export type UpdateVocabularyGroupServiceInput = UpdateVocabularyGroupInput & { idempotencyKey: string };

/** A single update path for both ordinary edits and archiving — the audit action recorded reflects which one actually happened (`GROUP_ARCHIVED` vs `GROUP_UPDATED`), matching how `archiveItem`/`updateItem` stay distinct actions for learning items. */
export async function updateVocabularyGroup(db: DbClient, input: UpdateVocabularyGroupServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.update-group",
      key: input.idempotencyKey,
      payload: { groupId: input.groupId, name: input.name, status: input.status },
    },
    async (tx) => {
      await repoUpdateVocabularyGroup(tx, input.groupId, { name: input.name, status: input.status });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: input.status === "archived" ? "GROUP_ARCHIVED" : "GROUP_UPDATED",
        resourceType: "vocabulary_group",
        resourceId: input.groupId,
        afterData: { name: input.name, status: input.status },
      });
    },
  );
}

export type ReorderVocabularyGroupsServiceInput = ReorderVocabularyGroupsInput & { idempotencyKey: string };

export async function reorderVocabularyGroups(db: DbClient, input: ReorderVocabularyGroupsServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.reorder-groups",
      key: input.idempotencyKey,
      payload: { levelId: input.levelId, orderedGroupIds: input.orderedGroupIds },
    },
    async (tx) => {
      await repoReorderVocabularyGroups(tx, input.levelId, input.orderedGroupIds);
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "GROUP_REORDERED",
        resourceType: "level",
        resourceId: input.levelId,
        afterData: { orderedGroupIds: input.orderedGroupIds },
      });
    },
  );
}

// --- Bulk actions on the curriculum table (spec 11 rewrite's "Bulk Actions" / "Bulk Publish") ---
//
// Each function loops the same single-item repository calls the non-bulk
// versions above use, inside the one transaction `withIdempotency` already
// opens — a failure on any item rolls back the whole batch (the spec's
// literal "all selected publish, or none publish, after an unexpected
// database failure"), and every affected item still gets its own audit
// event (never a single combined one — matches the existing per-item audit
// action set, which has no BULK_* actions), tied together with a shared
// `correlationId` (the idempotency key) so the log shows they happened as
// one batch.

export type BulkArchiveItemsServiceInput = BulkArchiveLearningItemsInput & { idempotencyKey: string };

export async function bulkArchiveItems(db: DbClient, input: BulkArchiveItemsServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-archive-items",
      key: input.idempotencyKey,
      payload: { learningItemIds: input.learningItemIds, reason: input.reason },
    },
    async (tx) => {
      for (const learningItemId of input.learningItemIds) {
        const locked = await lockLearningItemForEdit(tx, learningItemId);
        if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

        await repoArchiveLearningItem(tx, learningItemId);
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_ARCHIVED",
          resourceType: itemResourceType(locked.type),
          resourceId: learningItemId,
          reason: input.reason,
          correlationId: input.idempotencyKey,
        });
        invalidateCurriculumCache(locked.languageId);
      }
    },
  );
}

export type BulkMoveItemsServiceInput = BulkMoveLearningItemsInput & { idempotencyKey: string };

export async function bulkMoveItems(db: DbClient, input: BulkMoveItemsServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-move-items",
      key: input.idempotencyKey,
      payload: { learningItemIds: input.learningItemIds, levelId: input.levelId, vocabularyGroupId: input.vocabularyGroupId },
    },
    async (tx) => {
      for (const learningItemId of input.learningItemIds) {
        const locked = await lockLearningItemForEdit(tx, learningItemId);
        if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

        await repoMoveLearningItem(tx, {
          learningItemId,
          type: locked.type,
          levelId: input.levelId,
          vocabularyGroupId: input.vocabularyGroupId,
        });
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_MOVED",
          resourceType: itemResourceType(locked.type),
          resourceId: learningItemId,
          beforeData: { levelId: locked.levelId },
          afterData: { levelId: input.levelId ?? locked.levelId, vocabularyGroupId: input.vocabularyGroupId },
          correlationId: input.idempotencyKey,
        });
        invalidateCurriculumCache(locked.languageId);
      }
    },
  );
}

export type BulkPublishPendingItemsServiceInput = BulkPublishPendingItemsInput & { idempotencyKey: string };

/** Rejects the whole batch if any selected item isn't actually `pending` right now — the spec's "Pending items may be selected and published together," not any item in any status. */
export async function bulkPublishPendingItems(db: DbClient, input: BulkPublishPendingItemsServiceInput): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-publish-pending-items",
      key: input.idempotencyKey,
      payload: { learningItemIds: input.learningItemIds },
    },
    async (tx) => {
      for (const learningItemId of input.learningItemIds) {
        const locked = await lockLearningItemForEdit(tx, learningItemId);
        if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
        if (locked.status !== "pending") {
          throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Every selected item must be Pending to bulk-publish. Reload and try again.");
        }

        await publishPendingItem(tx, learningItemId);
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_PUBLISHED",
          resourceType: itemResourceType(locked.type),
          resourceId: learningItemId,
          beforeData: { version: locked.version },
          correlationId: input.idempotencyKey,
        });
        invalidateCurriculumCache(locked.languageId);
      }
    },
  );
}
