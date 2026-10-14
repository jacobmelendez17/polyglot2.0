import type { DbClient } from "@/db/client";
import { isUniqueViolationOnConstraint } from "@/db/postgres-errors";
import {
  archiveLearningItem as repoArchiveLearningItem,
  attemptPermanentDelete,
  createLearningItem as repoCreateLearningItem,
  createLevel as repoCreateLevel,
  createVocabularyGroup as repoCreateVocabularyGroup,
  getAcceptedAnswers,
  getDraft,
  createExample,
  createGrammarContentBlock,
  createItemResource,
  createUsageContext,
  deleteExample,
  deleteGrammarContentBlock,
  deleteItemResource,
  deleteUsageContext,
  getVocabularyDictionaryFields,
  reorderExamples,
  reorderGrammarContentBlocks,
  reorderItemResources,
  reorderUsageContexts,
  setDictionaryFieldOverrides,
  updateExample,
  updateGrammarContentBlock,
  updateItemResource,
  updateUsageContext,
  getDuplicateCandidateRows,
  getGrammarContentBlockIds,
  replaceGrammarContentBlocks,
  getLearningItemGroupIds,
  getLevelLanguageId,
  getNextPosition,
  getVocabularyGroupLanguageId,
  lockLearningItemForEdit,
  lockLearningItemsForEdit,
  lockLevelTypeItems,
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
import {
  getGrammarContentBlocks,
  getLevelById,
  getVocabularyGroup,
} from "@/domains/curriculum/curriculum-repository";
import type { CurriculumGrammarContentBlock } from "@/domains/curriculum/curriculum-db-types";
import { findDuplicateCandidates } from "@/domains/curriculum/curriculum-duplicate-detection";
import type {
  DictionarySuppliedVocabularyFields,
  GrammarContentBlockInput,
  GrammarContentBlockSaveInput,
} from "@/domains/curriculum/curriculum-mutation-repository";
import {
  DICTIONARY_OVERRIDABLE_FIELDS,
  type DictionaryOverridableField,
} from "@/db/schema";
import { CURRICULUM_REORDER_LIMIT } from "@/domains/curriculum/curriculum-bulk-limits";
import {
  bulkArchiveLearningItemsInputSchema,
  bulkMoveLearningItemsInputSchema,
  bulkPublishPendingItemsInputSchema,
  reorderLearningItemsInputSchema,
} from "@/domains/curriculum/curriculum-mutation-schemas";
import type { VocabularyFieldsInput } from "@/domains/curriculum/curriculum-mutation-types";
import type {
  ArchiveLearningItemInput,
  BulkArchiveLearningItemsInput,
  BulkArchiveLearningItemsResult,
  BulkMoveLearningItemsInput,
  BulkMoveLearningItemsResult,
  BulkPublishDraftedItemsInput,
  BulkPublishDraftedItemsResult,
  BulkPublishPendingItemsInput,
  BulkPublishPendingItemsResult,
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

/**
 * A level or group a move names must exist **in the language the items are
 * in** (spec 26 §3, "Cross-language isolation"). A level of another language
 * would be refused by the database, but as a bare constraint failure; a *group*
 * of another language would not be refused at all — nothing ties an item's
 * group to its language — and the item would quietly sit in a stranger's
 * curriculum. "No such level" and "another language's level" get one answer, so
 * a caller learns nothing about ids they did not name correctly.
 */
async function assertMoveTargetsInLanguage(
  db: DbClient,
  languageId: string,
  targets: { levelId?: string; vocabularyGroupId?: string },
): Promise<void> {
  if (
    targets.levelId &&
    (await getLevelLanguageId(db, targets.levelId)) !== languageId
  ) {
    throw new AdminError(
      "CURRICULUM_VALIDATION_FAILED",
      "That level doesn't belong to the selected language.",
    );
  }
  if (
    targets.vocabularyGroupId &&
    (await getVocabularyGroupLanguageId(db, targets.vocabularyGroupId)) !==
      languageId
  ) {
    throw new AdminError(
      "CURRICULUM_VALIDATION_FAILED",
      "That group doesn't belong to the selected language.",
    );
  }
}

/**
 * The items a bulk command names, row-locked (in one fixed order, so two
 * overlapping batches take turns instead of deadlocking) and returned **in the
 * order the caller named them** — which is the order a move appends them in.
 * Every one must exist and belong to the language the command acts in; a batch
 * with a stranger in it is refused whole, before anything is written.
 */
async function lockBulkItems(
  db: DbClient,
  languageId: string,
  learningItemIds: string[],
) {
  const locked = await lockLearningItemsForEdit(db, learningItemIds);
  const byId = new Map(locked.map((row) => [row.id.toLowerCase(), row]));
  return learningItemIds.map((id) => {
    const row = byId.get(id.toLowerCase());
    if (!row) {
      throw new AdminError(
        "CURRICULUM_ITEM_NOT_FOUND",
        "One of the selected items no longer exists. Reload the list and try again.",
      );
    }
    if (row.languageId !== languageId) {
      throw new AdminError(
        "CURRICULUM_VALIDATION_FAILED",
        "Some of the selected items aren't in this language. Reload the list and try again.",
      );
    }
    return row;
  });
}

async function checkDuplicates(
  db: DbClient,
  languageId: string,
  type: "vocabulary" | "grammar",
  displayForm: string,
  excludeLearningItemId: string | undefined,
  approvedAsHomonymOf: string | null | undefined,
) {
  const candidateRows = await getDuplicateCandidateRows(
    db,
    languageId,
    type,
    excludeLearningItemId,
  );
  const matches = findDuplicateCandidates(displayForm, candidateRows);
  if (matches.length > 0 && !approvedAsHomonymOf) {
    throw new AdminError("DUPLICATE_ITEM", undefined, { candidates: matches });
  }
}

export type CreateItemServiceInput = CreateLearningItemInput & {
  idempotencyKey: string;
};

export async function createItem(
  db: DbClient,
  input: CreateItemServiceInput,
): Promise<{ learningItemId: string }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.create-item",
      key: input.idempotencyKey,
      payload: {
        languageId: input.languageId,
        levelId: input.levelId,
        type: input.type,
        fields: input.fields,
      },
    },
    async (tx) => {
      const displayForm =
        input.type === "vocabulary"
          ? input.fields.term
          : input.fields.structure;
      await checkDuplicates(
        tx,
        input.languageId,
        input.type,
        displayForm,
        undefined,
        input.approvedAsHomonymOf,
      );

      // Appended at the end of this level+type's ordering — computed here,
      // not supplied by the caller, since a hardcoded/guessed position
      // would collide with `learning_items_level_type_position_key`'s
      // unique constraint the moment a second item was ever created in the
      // same level+type.
      const position = await getNextPosition(tx, input.levelId, input.type);
      const base = {
        languageId: input.languageId,
        levelId: input.levelId,
        position,
        lessonPriority: position,
      };
      const learningItemId =
        input.type === "vocabulary"
          ? await repoCreateLearningItem(tx, {
              ...base,
              type: "vocabulary",
              fields: input.fields,
            })
          : await repoCreateLearningItem(tx, {
              ...base,
              type: "grammar",
              fields: input.fields,
            });

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

export type UpdateItemServiceInput = UpdateLearningItemInput & {
  idempotencyKey: string;
};

export async function updateItem(
  db: DbClient,
  input: UpdateItemServiceInput,
): Promise<{ savedAsDraft: boolean }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.update-item",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        type: input.type,
        fields: input.fields,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }
      if (locked.type !== input.type) {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "An item's type cannot change after creation.",
        );
      }

      const displayForm =
        input.type === "vocabulary"
          ? input.fields.term
          : input.fields.structure;
      await checkDuplicates(
        tx,
        locked.languageId,
        input.type,
        displayForm,
        input.learningItemId,
        input.approvedAsHomonymOf,
      );

      const beforeAnswers = await getAcceptedAnswers(tx, input.learningItemId);
      const savedAsDraft = locked.status === "published";
      const itemData =
        input.type === "vocabulary"
          ? { type: "vocabulary" as const, fields: input.fields }
          : { type: "grammar" as const, fields: input.fields };

      // Editing a dictionary-supplied field by hand takes authorship of it
      // (spec 17). Derived by comparing against what is stored rather than
      // trusting a client-sent flag, and marked even when the edit is saved
      // as a draft: the author has expressed intent, and the dictionary
      // should stop overwriting the live value in the meantime.
      const authoredFields =
        input.type === "vocabulary"
          ? await markAuthoredDictionaryFields(
              tx,
              input.learningItemId,
              input.fields,
            )
          : [];

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
        afterData: {
          fields: input.fields,
          savedAsDraft,
          ...(authoredFields.length > 0 ? { authoredFields } : {}),
        },
      });

      return { savedAsDraft };
    },
  );
}

/**
 * Marks every dictionary-supplied field this save actually changed as
 * authored by hand, and returns them for the audit trail. Fields whose
 * submitted value matches what is stored are left alone — re-saving a form
 * without touching the teaching meaning must not silently take it over.
 */
async function markAuthoredDictionaryFields(
  tx: DbClient,
  learningItemId: string,
  fields: VocabularyFieldsInput,
): Promise<DictionaryOverridableField[]> {
  const current = await getVocabularyDictionaryFields(tx, learningItemId);
  if (!current) return [];

  const submitted: Record<DictionaryOverridableField, string | null> = {
    definition: fields.definition ?? null,
    partOfSpeech: fields.partOfSpeech,
    ipa: fields.ipa ?? null,
  };
  const changed = DICTIONARY_OVERRIDABLE_FIELDS.filter(
    (field) => submitted[field] !== current[field],
  );
  if (changed.length === 0) return [];

  await setDictionaryFieldOverrides(tx, learningItemId, [
    ...current.dictionaryFieldOverrides,
    ...changed,
  ]);
  return changed;
}

export type ResetDictionaryFieldServiceInput = {
  learningItemId: string;
  field: DictionaryOverridableField;
  actorUserId: string;
  idempotencyKey: string;
};

/**
 * Hands one field back to the dictionary (spec 17's "Reset to dictionary").
 *
 * Only clears the mark — it does not itself write a dictionary value, because
 * this domain has no access to one. The caller re-runs the promotion
 * afterwards, which is the same path every other dictionary write takes, so
 * there is exactly one place that knows how a dictionary value reaches an
 * item.
 */
export async function resetDictionaryFieldOverride(
  db: DbClient,
  input: ResetDictionaryFieldServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.reset-dictionary-field",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, field: input.field },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.type !== "vocabulary") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Only vocabulary items have dictionary fields.",
        );
      }

      const current = await getVocabularyDictionaryFields(
        tx,
        input.learningItemId,
      );
      if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (!current.dictionaryFieldOverrides.includes(input.field)) return;

      await setDictionaryFieldOverrides(
        tx,
        input.learningItemId,
        current.dictionaryFieldOverrides.filter(
          (field) => field !== input.field,
        ),
      );
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_UPDATED",
        resourceType: "vocabulary_item",
        resourceId: input.learningItemId,
        beforeData: { authoredFields: current.dictionaryFieldOverrides },
        afterData: { resetToDictionary: input.field },
      });
      invalidateCurriculumCache(locked.languageId);
    },
  );
}

export type UsageContextMutation =
  | {
      kind: "create";
      learningItemId: string;
      label: string;
      note?: string | null;
      sourceForm?: string | null;
    }
  | {
      kind: "update";
      usageContextId: string;
      label?: string;
      note?: string | null;
    }
  | { kind: "delete"; usageContextId: string }
  | { kind: "reorder"; learningItemId: string; orderedIds: string[] };

export type UsageContextServiceInput = {
  learningItemId: string;
  actorUserId: string;
  idempotencyKey: string;
  mutation: UsageContextMutation;
};

/**
 * One entry point for every change to a word's usage contexts (spec 17),
 * rather than four near-identical services: they share the same lock, the
 * same authorization, and the same audit action, and differ only in the one
 * repository call they make.
 *
 * Authoring, not publishing — a writer may do this. The tabs belong to the
 * item, so a published item's tabs change live rather than through a draft:
 * `curriculum_item_drafts` snapshots the *editable fields* of an item and
 * has nowhere to put a list of contexts. That is a deliberate limit worth
 * knowing: rearranging tabs on a published word is immediately visible.
 */
export async function mutateUsageContext(
  db: DbClient,
  input: UsageContextServiceInput,
): Promise<{ usageContextId: string | null }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.usage-context",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        mutation: input.mutation,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      // Grammar items may have usage contexts too, as of spec 18: its
      // "Pattern of Use" tabs are this exact concept, and it asks for them
      // on both item types. Spec 17 restricted them to vocabulary because
      // only vocabulary can *seed* a context from a dictionary form — which
      // is still true, and stays true without a check here: seeding reads a
      // confirmed vocabulary dictionary mapping, which a grammar item can
      // never have, so `seedUsageContextsAction` already declines it.
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }

      let usageContextId: string | null = null;
      const { mutation } = input;
      if (mutation.kind === "create") {
        usageContextId = await createUsageContext(tx, {
          learningItemId: input.learningItemId,
          label: mutation.label,
          note: mutation.note,
          sourceForm: mutation.sourceForm,
        });
      } else if (mutation.kind === "update") {
        await updateUsageContext(tx, mutation.usageContextId, {
          label: mutation.label,
          note: mutation.note,
        });
        usageContextId = mutation.usageContextId;
      } else if (mutation.kind === "delete") {
        await deleteUsageContext(tx, mutation.usageContextId);
      } else {
        await reorderUsageContexts(
          tx,
          input.learningItemId,
          mutation.orderedIds,
        );
      }

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "USAGE_CONTEXT_CHANGED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        afterData: { ...mutation },
      });
      invalidateCurriculumCache(locked.languageId);
      return { usageContextId };
    },
  );
}

export type ExampleMutation =
  | {
      kind: "create";
      targetText: string;
      translation: string;
      usageContextId?: string | null;
    }
  | {
      kind: "update";
      exampleId: string;
      targetText?: string;
      translation?: string;
      usageContextId?: string | null;
    }
  | { kind: "delete"; exampleId: string }
  | { kind: "reorder"; orderedIds: string[] };

/**
 * Every change to a grammar item's About content blocks (spec 18), in one
 * service for the same reasons `mutateUsageContext` is one: shared lock,
 * shared authorization, shared audit action, differing only in the single
 * repository call.
 *
 * Live, not drafted — the same deliberate limit usage contexts and examples
 * have. `curriculum_item_drafts` snapshots an item's *editable fields* and
 * has nowhere to put an ordered child collection, so editing a published
 * grammar point's blocks changes what learners see immediately. Worth
 * knowing before rewriting an explanation on a live item.
 */
export type GrammarContentBlockMutation =
  | ({ kind: "create" } & GrammarContentBlockInput)
  | ({ kind: "update"; blockId: string } & GrammarContentBlockInput)
  | { kind: "delete"; blockId: string }
  | { kind: "reorder"; orderedIds: string[] };

export type GrammarContentBlockServiceInput = {
  learningItemId: string;
  actorUserId: string;
  idempotencyKey: string;
  mutation: GrammarContentBlockMutation;
};

export async function mutateGrammarContentBlock(
  db: DbClient,
  input: GrammarContentBlockServiceInput,
): Promise<{ blockId: string | null }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.grammar-content-block",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        mutation: input.mutation,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.type !== "grammar") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Only grammar items have content blocks.",
        );
      }
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }

      let blockId: string | null = null;
      const { mutation } = input;
      if (mutation.kind === "create") {
        blockId = await createGrammarContentBlock(
          tx,
          input.learningItemId,
          mutation,
        );
      } else if (mutation.kind === "update") {
        await updateGrammarContentBlock(tx, mutation.blockId, mutation);
        blockId = mutation.blockId;
      } else if (mutation.kind === "delete") {
        await deleteGrammarContentBlock(tx, mutation.blockId);
      } else {
        await reorderGrammarContentBlocks(
          tx,
          input.learningItemId,
          mutation.orderedIds,
        );
      }

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "GRAMMAR_CONTENT_BLOCKS_CHANGED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        afterData: { ...mutation },
      });
      invalidateCurriculumCache(locked.languageId);
      return { blockId };
    },
  );
}

export type SaveGrammarContentBlocksServiceInput = {
  learningItemId: string;
  actorUserId: string;
  idempotencyKey: string;
  blocks: GrammarContentBlockSaveInput[];
};

/**
 * The content builder's Save (spec 18): replaces an item's whole About-block
 * list — additions, edits, deletions, and order — in one transaction, so what
 * the admin sees staged is exactly what is applied or nothing is. Returns the
 * persisted list so the editor can show what actually landed.
 */
export async function saveGrammarContentBlocks(
  db: DbClient,
  input: SaveGrammarContentBlocksServiceInput,
): Promise<{ blocks: CurriculumGrammarContentBlock[] }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.grammar-content-blocks-save",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId, blocks: input.blocks },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.type !== "grammar") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Only grammar items have content blocks.",
        );
      }
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }

      const existingIds = new Set(
        await getGrammarContentBlockIds(tx, input.learningItemId),
      );
      if (
        input.blocks.some((block) => block.id && !existingIds.has(block.id))
      ) {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "One of those blocks no longer exists. Reload the page and try again.",
        );
      }

      await replaceGrammarContentBlocks(tx, input.learningItemId, input.blocks);
      const saved = await getGrammarContentBlocks(tx, input.learningItemId);

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "GRAMMAR_CONTENT_BLOCKS_CHANGED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        afterData: { kind: "save", blocks: saved },
      });
      invalidateCurriculumCache(locked.languageId);
      return { blocks: saved };
    },
  );
}

/**
 * Every change to an item's external resource links (spec 18). Applies to
 * both item types, and is live rather than drafted for the same reason the
 * other child collections are.
 */
export type ItemResourceMutation =
  | { kind: "create"; label: string; url: string }
  | { kind: "update"; resourceId: string; label?: string; url?: string }
  | { kind: "delete"; resourceId: string }
  | { kind: "reorder"; orderedIds: string[] };

export type ItemResourceServiceInput = {
  learningItemId: string;
  actorUserId: string;
  idempotencyKey: string;
  mutation: ItemResourceMutation;
};

export async function mutateItemResource(
  db: DbClient,
  input: ItemResourceServiceInput,
): Promise<{ resourceId: string | null }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.item-resource",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        mutation: input.mutation,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }

      let resourceId: string | null = null;
      const { mutation } = input;
      if (mutation.kind === "create") {
        resourceId = await createItemResource(tx, input.learningItemId, {
          label: mutation.label,
          url: mutation.url,
        });
      } else if (mutation.kind === "update") {
        await updateItemResource(tx, mutation.resourceId, {
          label: mutation.label,
          url: mutation.url,
        });
        resourceId = mutation.resourceId;
      } else if (mutation.kind === "delete") {
        await deleteItemResource(tx, mutation.resourceId);
      } else {
        await reorderItemResources(
          tx,
          input.learningItemId,
          mutation.orderedIds,
        );
      }

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "ITEM_RESOURCES_CHANGED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        afterData: { ...mutation },
      });
      invalidateCurriculumCache(locked.languageId);
      return { resourceId };
    },
  );
}

export type ExampleServiceInput = {
  learningItemId: string;
  actorUserId: string;
  idempotencyKey: string;
  mutation: ExampleMutation;
};

/**
 * Every change to a word's or grammar point's example sentences (spec 17).
 *
 * Grammar is allowed here even though it has no usage contexts — it has
 * examples, and until now nothing in the application could author one at
 * all: the tables existed and rendered to learners, but no surface wrote
 * them.
 */
export async function mutateItemExample(
  db: DbClient,
  input: ExampleServiceInput,
): Promise<{ exampleId: string | null }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.item-example",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        mutation: input.mutation,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }

      let exampleId: string | null = null;
      const { mutation } = input;
      if (mutation.kind === "create") {
        exampleId = await createExample(tx, {
          learningItemId: input.learningItemId,
          languageId: locked.languageId,
          targetText: mutation.targetText,
          translation: mutation.translation,
          usageContextId: mutation.usageContextId,
        });
      } else if (mutation.kind === "update") {
        await updateExample(tx, mutation.exampleId, {
          targetText: mutation.targetText,
          translation: mutation.translation,
          usageContextId: mutation.usageContextId,
        });
        exampleId = mutation.exampleId;
      } else if (mutation.kind === "delete") {
        await deleteExample(tx, mutation.exampleId);
      } else {
        await reorderExamples(tx, input.learningItemId, mutation.orderedIds);
      }

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "ITEM_EXAMPLES_CHANGED",
        resourceType: itemResourceType(locked.type),
        resourceId: input.learningItemId,
        afterData: { ...mutation },
      });
      invalidateCurriculumCache(locked.languageId);
      return { exampleId };
    },
  );
}

export type PublishItemServiceInput = PublishLearningItemInput & {
  idempotencyKey: string;
};

export async function publishItem(
  db: DbClient,
  input: PublishItemServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.publish-item",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        expectedVersion: input.expectedVersion,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      if (locked.version !== input.expectedVersion)
        throw new AdminError("ADMIN_EDIT_CONFLICT");
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be published.",
        );
      }

      if (locked.status === "pending") {
        await publishPendingItem(tx, input.learningItemId);
      } else {
        const draft = await getDraft(tx, input.learningItemId);
        if (!draft) {
          throw new AdminError(
            "CURRICULUM_VALIDATION_FAILED",
            "There are no unpublished changes to publish.",
          );
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

export type ArchiveItemServiceInput = ArchiveLearningItemInput & {
  idempotencyKey: string;
};

export async function archiveItem(
  db: DbClient,
  input: ArchiveItemServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.archive-item",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId },
    },
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

export type ApplyDictionaryFieldsResult = {
  applied: boolean;
  savedAsDraft: boolean;
};

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
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Only vocabulary items have dictionary data.",
        );
      }
      if (locked.status === "archived") {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          "Archived items cannot be edited.",
        );
      }

      const current = await getVocabularyDictionaryFields(
        tx,
        input.learningItemId,
      );
      if (!current) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");

      // A field an author has taken over is never overwritten again (spec
      // 17), no matter how the promotion was triggered — re-confirming,
      // changing the selected sense, or a re-import all arrive here.
      const overridden = new Set(current.dictionaryFieldOverrides);
      const supplied = (
        field: DictionaryOverridableField,
        value: string | null,
      ) => (overridden.has(field) ? null : value);

      const next = {
        partOfSpeech:
          supplied("partOfSpeech", input.fields.partOfSpeech) ??
          current.partOfSpeech,
        definition:
          supplied("definition", input.fields.definition) ?? current.definition,
        ipa: supplied("ipa", input.fields.ipa) ?? current.ipa,
      };
      const unchanged =
        next.partOfSpeech === current.partOfSpeech &&
        next.definition === current.definition &&
        next.ipa === current.ipa;
      // Nothing to record and nothing to write — an admin re-opening an
      // already-applied item should not accumulate identical audit events.
      if (unchanged) return { applied: false, savedAsDraft: false };

      const savedAsDraft = locked.status === "published";

      if (savedAsDraft) {
        const acceptedAnswers = await getAcceptedAnswers(
          tx,
          input.learningItemId,
        );
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
              acceptedAnswers: acceptedAnswers.map((answer) => ({
                side: answer.side,
                value: answer.value,
              })),
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
        beforeData: {
          partOfSpeech: current.partOfSpeech,
          definition: current.definition,
          ipa: current.ipa,
        },
        afterData: { ...next, source: "dictionary", savedAsDraft },
      });
      invalidateCurriculumCache(locked.languageId);

      return { applied: true, savedAsDraft };
    },
  );
}

export type DeleteItemServiceInput = DeleteLearningItemInput & {
  idempotencyKey: string;
};

/** Tries a permanent delete; falls back to archive when referential integrity blocks it (spec 11 rewrite's "Archive/Delete"). */
export async function deleteItem(
  db: DbClient,
  input: DeleteItemServiceInput,
): Promise<DeleteLearningItemResult> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.delete-item",
      key: input.idempotencyKey,
      payload: { learningItemId: input.learningItemId },
    },
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

      const reason =
        "This item has existing learner progress and cannot be permanently deleted. It will be archived instead.";
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

export type MoveItemServiceInput = MoveLearningItemInput & {
  idempotencyKey: string;
};

export async function moveItem(
  db: DbClient,
  input: MoveItemServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.move-item",
      key: input.idempotencyKey,
      payload: {
        learningItemId: input.learningItemId,
        levelId: input.levelId,
        vocabularyGroupId: input.vocabularyGroupId,
      },
    },
    async (tx) => {
      const locked = await lockLearningItemForEdit(tx, input.learningItemId);
      if (!locked) throw new AdminError("CURRICULUM_ITEM_NOT_FOUND");
      await assertMoveTargetsInLanguage(tx, locked.languageId, input);

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
        afterData: {
          levelId: input.levelId ?? locked.levelId,
          vocabularyGroupId: input.vocabularyGroupId,
        },
      });
      invalidateCurriculumCache(locked.languageId);
    },
  );
}

export type ReorderItemsServiceInput = ReorderLearningItemsInput & {
  idempotencyKey: string;
};

export async function reorderItems(
  db: DbClient,
  input: ReorderItemsServiceInput,
): Promise<void> {
  reorderLearningItemsInputSchema.parse(input);
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.reorder-items",
      key: input.idempotencyKey,
      payload: {
        levelId: input.levelId,
        type: input.type,
        orderedLearningItemIds: input.orderedLearningItemIds,
      },
    },
    async (tx) => {
      // An order is *all* of a level+type's items, once each. `position` is
      // unique within the pair, so a list that leaves one out would number the
      // rest into its place and fail on the constraint, and one that names an
      // item from elsewhere would be skipped without a word — either way a
      // partial order. The set is locked first, so it cannot change under us.
      const current = await lockLevelTypeItems(tx, input.levelId, input.type);
      if (current.length > CURRICULUM_REORDER_LIMIT) {
        throw new AdminError(
          "CURRICULUM_VALIDATION_FAILED",
          `This level has more than ${CURRICULUM_REORDER_LIMIT} ${input.type} items, which is more than the order tool can arrange at once.`,
        );
      }
      const named = new Set(
        input.orderedLearningItemIds.map((id) => id.toLowerCase()),
      );
      if (
        current.length !== named.size ||
        current.some((id) => !named.has(id.toLowerCase()))
      ) {
        throw new AdminError(
          "ADMIN_EDIT_CONFLICT",
          "This level's items changed while you were arranging them. Reload to see the current order, then try again.",
        );
      }
      await repoReorderLearningItems(
        tx,
        input.levelId,
        input.type,
        input.orderedLearningItemIds,
      );
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "CURRICULUM_ITEM_REORDERED",
        resourceType: "level",
        resourceId: input.levelId,
        afterData: {
          type: input.type,
          orderedLearningItemIds: input.orderedLearningItemIds,
        },
      });
    },
  );
}

// --- Levels management (spec 11 rewrite's "Levels Management") ---

export type CreateLevelServiceInput = CreateLevelInput & {
  idempotencyKey: string;
};

/**
 * A level number is used once per language — the database's own unique
 * constraint is the authority, not a "check, then insert" that two Admins could
 * race past. When it fires, the person gets an answer they can act on (pick
 * another number) instead of a raw database failure. The refusal rolls back
 * with the idempotency key, so the same key is free for the corrected attempt.
 */
const LEVEL_NUMBER_CONSTRAINT = "levels_language_id_level_number_key";

export async function createLevel(
  db: DbClient,
  input: CreateLevelServiceInput,
): Promise<{ levelId: string }> {
  try {
    return await withIdempotency(
      db,
      {
        userId: input.actorUserId,
        operation: "admin.curriculum.create-level",
        key: input.idempotencyKey,
        payload: {
          languageId: input.languageId,
          levelNumber: input.levelNumber,
          name: input.name,
        },
      },
      async (tx) => {
        const levelId = await repoCreateLevel(tx, {
          languageId: input.languageId,
          levelNumber: input.levelNumber,
          name: input.name,
        });
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "LEVEL_CREATED",
          resourceType: "level",
          resourceId: levelId,
          afterData: {
            languageId: input.languageId,
            levelNumber: input.levelNumber,
            name: input.name,
          },
        });
        return { levelId };
      },
    );
  } catch (error) {
    if (isUniqueViolationOnConstraint(error, LEVEL_NUMBER_CONSTRAINT)) {
      throw new AdminError(
        "CURRICULUM_VALIDATION_FAILED",
        `Level ${input.levelNumber} already exists for this language.`,
      );
    }
    throw error;
  }
}

export type UpdateLevelServiceInput = UpdateLevelInput & {
  idempotencyKey: string;
};

/**
 * Publishing a level is an Admin decision, full stop (spec 17).
 *
 * This used to refuse unless the level counted 48 vocabulary, 4 groups and
 * 12 grammar items — which made every level the same fixed shape. Levels
 * hold whatever they hold; an Admin publishing one is the approval.
 */
export async function updateLevel(
  db: DbClient,
  input: UpdateLevelServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.update-level",
      key: input.idempotencyKey,
      payload: {
        levelId: input.levelId,
        name: input.name,
        status: input.status,
        cefrLevel: input.cefrLevel,
      },
    },
    async (tx) => {
      // The write below is an `UPDATE ... WHERE id = ?`, which changes nothing —
      // and says nothing — for an id that is not there; the audit event after
      // it would then record an edit to a level that does not exist.
      if (!(await getLevelById(tx, input.levelId))) {
        throw new AdminError(
          "CURRICULUM_ITEM_NOT_FOUND",
          "That level could not be found.",
        );
      }
      await repoUpdateLevel(tx, input.levelId, {
        name: input.name,
        status: input.status,
        cefrLevel: input.cefrLevel,
      });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "LEVEL_UPDATED",
        resourceType: "level",
        resourceId: input.levelId,
        afterData: {
          name: input.name,
          status: input.status,
          cefrLevel: input.cefrLevel,
        },
      });
    },
  );
}

// --- Vocabulary groups/themes management (spec 11 rewrite's "Vocabulary Groups / Themes") ---

export type CreateVocabularyGroupServiceInput = CreateVocabularyGroupInput & {
  idempotencyKey: string;
};

export async function createVocabularyGroup(
  db: DbClient,
  input: CreateVocabularyGroupServiceInput,
): Promise<{ groupId: string }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.create-group",
      key: input.idempotencyKey,
      payload: {
        levelId: input.levelId,
        languageId: input.languageId,
        name: input.name,
      },
    },
    async (tx) => {
      const groupId = await repoCreateVocabularyGroup(tx, {
        levelId: input.levelId,
        languageId: input.languageId,
        name: input.name,
      });
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

export type UpdateVocabularyGroupServiceInput = UpdateVocabularyGroupInput & {
  idempotencyKey: string;
};

/** A single update path for both ordinary edits and archiving — the audit action recorded reflects which one actually happened (`GROUP_ARCHIVED` vs `GROUP_UPDATED`), matching how `archiveItem`/`updateItem` stay distinct actions for learning items. */
export async function updateVocabularyGroup(
  db: DbClient,
  input: UpdateVocabularyGroupServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.update-group",
      key: input.idempotencyKey,
      payload: {
        groupId: input.groupId,
        name: input.name,
        status: input.status,
      },
    },
    async (tx) => {
      // The write below is an `UPDATE ... WHERE id = ?`, which changes nothing —
      // and says nothing — for an id that is not there; the audit event after
      // it would then record an edit to a group that does not exist.
      if (!(await getVocabularyGroup(tx, input.groupId))) {
        throw new AdminError(
          "CURRICULUM_ITEM_NOT_FOUND",
          "That group could not be found.",
        );
      }
      await repoUpdateVocabularyGroup(tx, input.groupId, {
        name: input.name,
        status: input.status,
      });
      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action:
          input.status === "archived" ? "GROUP_ARCHIVED" : "GROUP_UPDATED",
        resourceType: "vocabulary_group",
        resourceId: input.groupId,
        afterData: { name: input.name, status: input.status },
      });
    },
  );
}

export type ReorderVocabularyGroupsServiceInput =
  ReorderVocabularyGroupsInput & { idempotencyKey: string };

export async function reorderVocabularyGroups(
  db: DbClient,
  input: ReorderVocabularyGroupsServiceInput,
): Promise<void> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.reorder-groups",
      key: input.idempotencyKey,
      payload: {
        levelId: input.levelId,
        orderedGroupIds: input.orderedGroupIds,
      },
    },
    async (tx) => {
      await repoReorderVocabularyGroups(
        tx,
        input.levelId,
        input.orderedGroupIds,
      );
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

// --- Bulk actions on the curriculum table (spec 11 rewrite's "Bulk Actions" / "Bulk Publish"; spec 26 Unit 7) ---
//
// Each function works through the named items inside the one transaction
// `withIdempotency` already opens — a failure on any item rolls back the whole
// batch (the spec's literal "all selected publish, or none publish, after an
// unexpected database failure"), and every affected item still gets its own
// audit event (never a single combined one — matches the existing per-item
// audit action set, which has no BULK_* actions), tied together with a shared
// `correlationId` (the idempotency key) so the log shows they happened as one
// batch.
//
// What a batch guards, beyond the single-item versions:
// - **Bounded and distinct**: one to `CURRICULUM_BULK_ITEM_LIMIT` items, each
//   named once (the input schemas), so a request cannot ask for unbounded work
//   or have an item archived, moved or numbered twice.
// - **One language**: the command names the language it acts in, and every
//   item — and any level or group it is moved to — must belong to it.
// - **Locked in one order**: all rows are locked up front, sorted by id, so two
//   overlapping batches wait for each other instead of deadlocking.
// - **A no-op is not a change**: an item already where the command would put it
//   is left exactly as it was, with no write and no audit event, and the result
//   says so.

export type BulkArchiveItemsServiceInput = BulkArchiveLearningItemsInput & {
  idempotencyKey: string;
};

export async function bulkArchiveItems(
  db: DbClient,
  input: BulkArchiveItemsServiceInput,
): Promise<BulkArchiveLearningItemsResult> {
  const parsed = bulkArchiveLearningItemsInputSchema.parse(input);
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-archive-items",
      key: input.idempotencyKey,
      payload: {
        languageId: parsed.languageId,
        learningItemIds: parsed.learningItemIds,
        reason: parsed.reason,
      },
    },
    async (tx) => {
      const result: BulkArchiveLearningItemsResult = {
        archivedItemIds: [],
        alreadyArchivedItemIds: [],
      };
      const items = await lockBulkItems(
        tx,
        parsed.languageId,
        parsed.learningItemIds,
      );
      for (const locked of items) {
        if (locked.status === "archived") {
          result.alreadyArchivedItemIds.push(locked.id);
          continue;
        }
        await repoArchiveLearningItem(tx, locked.id);
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_ARCHIVED",
          resourceType: itemResourceType(locked.type),
          resourceId: locked.id,
          reason: parsed.reason,
          correlationId: input.idempotencyKey,
        });
        result.archivedItemIds.push(locked.id);
      }
      invalidateCurriculumCache(parsed.languageId);
      return result;
    },
  );
}

export type BulkMoveItemsServiceInput = BulkMoveLearningItemsInput & {
  idempotencyKey: string;
};

export async function bulkMoveItems(
  db: DbClient,
  input: BulkMoveItemsServiceInput,
): Promise<BulkMoveLearningItemsResult> {
  const parsed = bulkMoveLearningItemsInputSchema.parse(input);
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-move-items",
      key: input.idempotencyKey,
      payload: {
        languageId: parsed.languageId,
        learningItemIds: parsed.learningItemIds,
        levelId: parsed.levelId,
        vocabularyGroupId: parsed.vocabularyGroupId,
      },
    },
    async (tx) => {
      await assertMoveTargetsInLanguage(tx, parsed.languageId, parsed);
      const result: BulkMoveLearningItemsResult = {
        movedItemIds: [],
        unchangedItemIds: [],
      };
      const items = await lockBulkItems(
        tx,
        parsed.languageId,
        parsed.learningItemIds,
      );
      const groupOf = parsed.vocabularyGroupId
        ? await getLearningItemGroupIds(
            tx,
            items.map((item) => item.id),
          )
        : new Map<string, string | null>();

      for (const locked of items) {
        const sameId = (a: string | null | undefined, b: string) =>
          a?.toLowerCase() === b.toLowerCase();
        // An item already in the target level would be re-appended to the end
        // of it (and a grammar item would lose its group) — so it is left alone.
        const levelChange =
          parsed.levelId && !sameId(locked.levelId, parsed.levelId)
            ? parsed.levelId
            : undefined;
        const previousGroupId = groupOf.get(locked.id) ?? null;
        const groupChanges =
          parsed.vocabularyGroupId !== undefined &&
          !sameId(previousGroupId, parsed.vocabularyGroupId);

        if (!levelChange && !groupChanges) {
          result.unchangedItemIds.push(locked.id);
          continue;
        }

        await repoMoveLearningItem(tx, {
          learningItemId: locked.id,
          type: locked.type,
          levelId: levelChange,
          // Passed whenever the command named a group, even one the item is
          // already in: a grammar item moved to another level is otherwise
          // ungrouped, and the command said which group it should end up in.
          vocabularyGroupId: parsed.vocabularyGroupId,
        });
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_MOVED",
          resourceType: itemResourceType(locked.type),
          resourceId: locked.id,
          beforeData: {
            levelId: locked.levelId,
            ...(parsed.vocabularyGroupId !== undefined
              ? { vocabularyGroupId: previousGroupId }
              : {}),
          },
          afterData: {
            levelId: levelChange ?? locked.levelId,
            vocabularyGroupId: parsed.vocabularyGroupId,
          },
          correlationId: input.idempotencyKey,
        });
        result.movedItemIds.push(locked.id);
      }
      invalidateCurriculumCache(parsed.languageId);
      return result;
    },
  );
}

export type BulkPublishPendingItemsServiceInput =
  BulkPublishPendingItemsInput & { idempotencyKey: string };

/**
 * Rejects the whole batch if any selected item isn't actually `pending` right
 * now — the spec's "Pending items may be selected and published together," not
 * any item in any status. That refusal is a *conflict* (the list the Admin
 * selected from is out of date), not a malformed request.
 */
export async function bulkPublishPendingItems(
  db: DbClient,
  input: BulkPublishPendingItemsServiceInput,
): Promise<BulkPublishPendingItemsResult> {
  const parsed = bulkPublishPendingItemsInputSchema.parse(input);
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-publish-pending-items",
      key: input.idempotencyKey,
      payload: {
        languageId: parsed.languageId,
        learningItemIds: parsed.learningItemIds,
      },
    },
    async (tx) => {
      const items = await lockBulkItems(
        tx,
        parsed.languageId,
        parsed.learningItemIds,
      );
      // Everything is checked before anything is written: nothing is half-published.
      if (items.some((locked) => locked.status !== "pending")) {
        throw new AdminError(
          "ADMIN_EDIT_CONFLICT",
          "Some of the selected items are no longer Pending — someone else may have published, archived or changed them. Reload the list and try again.",
        );
      }

      const result: BulkPublishPendingItemsResult = { publishedItemIds: [] };
      for (const locked of items) {
        await publishPendingItem(tx, locked.id);
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_PUBLISHED",
          resourceType: itemResourceType(locked.type),
          resourceId: locked.id,
          beforeData: { version: locked.version },
          correlationId: input.idempotencyKey,
        });
        result.publishedItemIds.push(locked.id);
      }
      invalidateCurriculumCache(parsed.languageId);
      return result;
    },
  );
}

export type BulkPublishDraftedItemsServiceInput =
  BulkPublishDraftedItemsInput & {
    idempotencyKey: string;
    /** Every audited publish carries this back to the import that drafted it (spec 25 §21's "published-after-import count"). Distinct from `idempotencyKey` — a retry of this same click must dedupe on the click, not on which import asked for it. */
    correlationId: string;
  };

/**
 * Spec 25 §14.3 — "Publish All Eligible Imported Changes." Reuses
 * `publishItem`'s own draft-promotion branch, one item at a time inside one
 * transaction, but — unlike {@link bulkPublishPendingItems} — never rejects
 * the whole batch over one item that no longer qualifies. This runs from an
 * import's completed-summary screen, an unbounded time after the import
 * itself finished; an item that lost its draft in the meantime (published by
 * hand, archived, or simply already published by an earlier click this
 * retried) is skipped, not a batch failure — see the type's own docstring.
 */
export async function bulkPublishDraftedItems(
  db: DbClient,
  input: BulkPublishDraftedItemsServiceInput,
): Promise<BulkPublishDraftedItemsResult> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-publish-drafted-items",
      key: input.idempotencyKey,
      payload: { learningItemIds: input.learningItemIds },
    },
    async (tx) => {
      const result: BulkPublishDraftedItemsResult = {
        publishedItemIds: [],
        skippedItemIds: [],
      };
      for (const learningItemId of input.learningItemIds) {
        const locked = await lockLearningItemForEdit(tx, learningItemId);
        if (!locked || locked.status !== "published") {
          result.skippedItemIds.push(learningItemId);
          continue;
        }
        const draft = await getDraft(tx, learningItemId);
        if (!draft) {
          result.skippedItemIds.push(learningItemId);
          continue;
        }

        await repoPublishDraft(tx, learningItemId, draft.data);
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_PUBLISHED",
          resourceType: itemResourceType(locked.type),
          resourceId: learningItemId,
          beforeData: { version: locked.version },
          correlationId: input.correlationId,
        });
        invalidateCurriculumCache(locked.languageId);
        result.publishedItemIds.push(learningItemId);
      }
      return result;
    },
  );
}
