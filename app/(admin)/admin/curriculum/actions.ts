"use server";

import { z } from "zod";

import { canManageCurriculum } from "@/domains/admin";
import {
  archiveItem,
  bulkArchiveItems,
  bulkMoveItems,
  bulkPublishPendingItems,
  createItem,
  createLevel,
  createVocabularyGroup,
  deleteItem,
  moveItem,
  publishItem,
  applyDictionaryFieldsToItem,
  reorderItems,
  reorderVocabularyGroups,
  resetDictionaryFieldOverride,
  updateItem,
  updateLevel,
  updateVocabularyGroup,
} from "@/domains/admin/server";
import { DICTIONARY_OVERRIDABLE_FIELDS } from "@/db/schema";
import { resolveConfirmedDictionaryFields } from "@/domains/lexicon";
import { getVocabularyMappingView } from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Thin Server Action entry points (spec 11 rewrite) for curriculum
 * mutations — every payload is validated with Zod, every action
 * re-authenticates and re-checks `canManageCurriculum` server-side (never
 * trusting hidden navigation or a disabled button), and business rules stay
 * entirely in `domains/admin`/`domains/curriculum`. Mirrors
 * `app/(focus)/reviews/actions.ts`'s `ActionResult`/error-mapping shape.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

async function runAdminAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canManageCurriculum(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AdminError) {
      return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "CURRICULUM_VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected admin action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const acceptedAnswerSchema = z.object({ side: z.enum(["term", "meaning"]), value: z.string().trim().min(1) });

const vocabularyFieldsSchema = z.object({
  vocabularyGroupId: z.string().min(1),
  term: z.string().trim().min(1),
  primaryMeaning: z.string().trim().min(1),
  definition: z.string().trim().min(1).nullish(),
  article: z.string().trim().min(1).nullish(),
  partOfSpeech: z.string().trim().min(1),
  pronunciation: z.string().trim().min(1).nullish(),
  ipa: z.string().trim().min(1).nullish(),
  context: z.string().trim().min(1).nullish(),
  creatorNotes: z.string().trim().min(1).nullish(),
  acceptedAnswers: z.array(acceptedAnswerSchema),
});

const grammarFieldsSchema = z.object({
  title: z.string().trim().min(1).nullish(),
  structure: z.string().trim().min(1),
  primaryMeaning: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  category: z.string().trim().min(1).nullish(),
  creatorNotes: z.string().trim().min(1).nullish(),
  requiredQuestions: z
    .array(z.object({ format: z.literal("translation"), direction: z.enum(["targetToEnglish", "englishToTarget"]) }))
    .min(1),
  acceptedAnswers: z.array(acceptedAnswerSchema),
});

const itemFieldsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vocabulary"), fields: vocabularyFieldsSchema }),
  z.object({ type: z.literal("grammar"), fields: grammarFieldsSchema }),
]);

const createItemActionSchema = z.intersection(
  z.object({
    languageId: z.string().min(1),
    levelId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    approvedAsHomonymOf: z.string().min(1).nullish(),
  }),
  itemFieldsSchema,
);

export async function createItemAction(input: z.infer<typeof createItemActionSchema>): Promise<ActionResult<{ learningItemId: string }>> {
  return runAdminAction(async () => {
    const parsed = createItemActionSchema.parse(input);
    const user = await requireUser();
    return createItem({ ...parsed, actorUserId: user.id });
  });
}

const updateItemActionSchema = z.intersection(
  z.object({
    learningItemId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    approvedAsHomonymOf: z.string().min(1).nullish(),
  }),
  itemFieldsSchema,
);

export async function updateItemAction(input: z.infer<typeof updateItemActionSchema>): Promise<ActionResult<{ savedAsDraft: boolean }>> {
  return runAdminAction(async () => {
    const parsed = updateItemActionSchema.parse(input);
    const user = await requireUser();
    return updateItem({ ...parsed, actorUserId: user.id });
  });
}


const resetDictionaryFieldActionSchema = z.object({
  learningItemId: z.string().min(1),
  field: z.enum(DICTIONARY_OVERRIDABLE_FIELDS),
  idempotencyKey: z.string().min(1),
});

/**
 * Spec 17's "Reset to dictionary": hands one field back, then immediately
 * re-applies the confirmed match so the field shows the dictionary's value
 * rather than sitting on the last hand-authored one until something else
 * triggers a promotion.
 *
 * Two steps rather than one because they belong to different domains — the
 * mark is curriculum state, the value comes from the lexicon — and the
 * second step is the same promotion path every other dictionary write uses.
 */
export async function resetDictionaryFieldAction(
  input: z.infer<typeof resetDictionaryFieldActionSchema>,
): Promise<ActionResult<{ reapplied: boolean }>> {
  return runAdminAction(async () => {
    const parsed = resetDictionaryFieldActionSchema.parse(input);
    const user = await requireUser();
    await resetDictionaryFieldOverride({ ...parsed, actorUserId: user.id });

    const view = await getVocabularyMappingView(parsed.learningItemId);
    const resolved = resolveConfirmedDictionaryFields(view);
    if (!resolved.confirmed) return { reapplied: false };

    const applied = await applyDictionaryFieldsToItem({
      learningItemId: parsed.learningItemId,
      actorUserId: user.id,
      idempotencyKey: crypto.randomUUID(),
      fields: { partOfSpeech: resolved.partOfSpeech, definition: resolved.definition, ipa: resolved.ipa },
    });
    return { reapplied: applied.applied };
  });
}

const publishItemActionSchema = z.object({
  learningItemId: z.string().min(1),
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1),
});

export async function publishItemAction(input: z.infer<typeof publishItemActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = publishItemActionSchema.parse(input);
    const user = await requireUser();
    await publishItem({ ...parsed, actorUserId: user.id });
  });
}

const archiveItemActionSchema = z.object({
  learningItemId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  reason: z.string().trim().min(1).optional(),
});

export async function archiveItemAction(input: z.infer<typeof archiveItemActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = archiveItemActionSchema.parse(input);
    const user = await requireUser();
    await archiveItem({ ...parsed, actorUserId: user.id });
  });
}

const deleteItemActionSchema = z.object({ learningItemId: z.string().min(1), idempotencyKey: z.string().min(1) });

export async function deleteItemAction(input: z.infer<typeof deleteItemActionSchema>) {
  return runAdminAction(async () => {
    const parsed = deleteItemActionSchema.parse(input);
    const user = await requireUser();
    return deleteItem({ ...parsed, actorUserId: user.id });
  });
}

const moveItemActionSchema = z.object({
  learningItemId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  levelId: z.string().min(1).optional(),
  vocabularyGroupId: z.string().min(1).optional(),
});

export async function moveItemAction(input: z.infer<typeof moveItemActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = moveItemActionSchema.parse(input);
    const user = await requireUser();
    await moveItem({ ...parsed, actorUserId: user.id });
  });
}

const reorderItemsActionSchema = z.object({
  levelId: z.string().min(1),
  type: z.enum(["vocabulary", "grammar"]),
  orderedLearningItemIds: z.array(z.string().min(1)).min(1),
  idempotencyKey: z.string().min(1),
});

export async function reorderItemsAction(input: z.infer<typeof reorderItemsActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = reorderItemsActionSchema.parse(input);
    const user = await requireUser();
    await reorderItems({ ...parsed, actorUserId: user.id });
  });
}

const curriculumStatusActionSchema = z.enum(["draft", "pending", "published", "archived"]);

const createLevelActionSchema = z.object({
  languageId: z.string().min(1),
  levelNumber: z.number().int().min(1),
  name: z.string().trim().min(1).nullish(),
  idempotencyKey: z.string().min(1),
});

export async function createLevelAction(input: z.infer<typeof createLevelActionSchema>): Promise<ActionResult<{ levelId: string }>> {
  return runAdminAction(async () => {
    const parsed = createLevelActionSchema.parse(input);
    const user = await requireUser();
    return createLevel({ ...parsed, actorUserId: user.id });
  });
}

const levelTargetActionSchema = z.number().int().min(0).max(1000).nullish();

const updateLevelActionSchema = z.object({
  levelId: z.string().min(1),
  name: z.string().trim().min(1).nullish(),
  status: curriculumStatusActionSchema.optional(),
  /** Per-level curriculum targets; `null` restores the configured default, `0` means no requirement. */
  targets: z
    .object({
      vocabularyItems: levelTargetActionSchema,
      vocabularyGroups: levelTargetActionSchema,
      grammarItems: levelTargetActionSchema,
    })
    .optional(),
  idempotencyKey: z.string().min(1),
});

export async function updateLevelAction(input: z.infer<typeof updateLevelActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = updateLevelActionSchema.parse(input);
    const user = await requireUser();
    await updateLevel({ ...parsed, actorUserId: user.id });
  });
}

const createVocabularyGroupActionSchema = z.object({
  levelId: z.string().min(1),
  languageId: z.string().min(1),
  name: z.string().trim().min(1),
  idempotencyKey: z.string().min(1),
});

export async function createVocabularyGroupAction(
  input: z.infer<typeof createVocabularyGroupActionSchema>,
): Promise<ActionResult<{ groupId: string }>> {
  return runAdminAction(async () => {
    const parsed = createVocabularyGroupActionSchema.parse(input);
    const user = await requireUser();
    return createVocabularyGroup({ ...parsed, actorUserId: user.id });
  });
}

const updateVocabularyGroupActionSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  status: curriculumStatusActionSchema.optional(),
  idempotencyKey: z.string().min(1),
});

export async function updateVocabularyGroupAction(
  input: z.infer<typeof updateVocabularyGroupActionSchema>,
): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = updateVocabularyGroupActionSchema.parse(input);
    const user = await requireUser();
    await updateVocabularyGroup({ ...parsed, actorUserId: user.id });
  });
}

const reorderVocabularyGroupsActionSchema = z.object({
  levelId: z.string().min(1),
  orderedGroupIds: z.array(z.string().min(1)).min(1),
  idempotencyKey: z.string().min(1),
});

export async function reorderVocabularyGroupsAction(
  input: z.infer<typeof reorderVocabularyGroupsActionSchema>,
): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = reorderVocabularyGroupsActionSchema.parse(input);
    const user = await requireUser();
    await reorderVocabularyGroups({ ...parsed, actorUserId: user.id });
  });
}

const bulkArchiveItemsActionSchema = z.object({
  learningItemIds: z.array(z.string().min(1)).min(1),
  reason: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().min(1),
});

export async function bulkArchiveItemsAction(input: z.infer<typeof bulkArchiveItemsActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = bulkArchiveItemsActionSchema.parse(input);
    const user = await requireUser();
    await bulkArchiveItems({ ...parsed, actorUserId: user.id });
  });
}

const bulkMoveItemsActionSchema = z.object({
  learningItemIds: z.array(z.string().min(1)).min(1),
  levelId: z.string().min(1).optional(),
  vocabularyGroupId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
});

export async function bulkMoveItemsAction(input: z.infer<typeof bulkMoveItemsActionSchema>): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = bulkMoveItemsActionSchema.parse(input);
    const user = await requireUser();
    await bulkMoveItems({ ...parsed, actorUserId: user.id });
  });
}

const bulkPublishPendingItemsActionSchema = z.object({
  learningItemIds: z.array(z.string().min(1)).min(1),
  idempotencyKey: z.string().min(1),
});

export async function bulkPublishPendingItemsAction(
  input: z.infer<typeof bulkPublishPendingItemsActionSchema>,
): Promise<ActionResult<void>> {
  return runAdminAction(async () => {
    const parsed = bulkPublishPendingItemsActionSchema.parse(input);
    const user = await requireUser();
    await bulkPublishPendingItems({ ...parsed, actorUserId: user.id });
  });
}
