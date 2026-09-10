"use server";

import { z } from "zod";

import { canManageCurriculum, canPublishCurriculum } from "@/domains/admin";
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
  mutateItemExample,
  mutateUsageContext,
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
import { proposeUsageContexts } from "@/domains/curriculum/usage-context-seeding";
import { getVocabularyMappingView } from "@/domains/lexicon/server";
import { getUsageContexts } from "@/domains/curriculum/server";
import type { PolyglotUser } from "@/domains/users";
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

/**
 * Authoring actions: Admin or writer (spec 17). Safe to delegate because
 * nothing here reaches a learner — new items are `pending`, edits to
 * published items are drafts, and releasing either needs `runPublishAction`.
 */
async function runAdminAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return runGuarded(canManageCurriculum, fn);
}

/** Actions that make curriculum live, or take it away. Admin only — this is where a writer's work waits for verification. */
async function runPublishAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return runGuarded(canPublishCurriculum, fn);
}

async function runGuarded<T>(
  permits: (user: { role: PolyglotUser["role"] }) => boolean,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!permits(user)) {
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


const usageContextMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), learningItemId: z.string().min(1), label: z.string().trim().min(1).max(80), note: z.string().trim().max(200).nullish(), sourceForm: z.string().trim().max(80).nullish() }),
  z.object({ kind: z.literal("update"), usageContextId: z.string().uuid(), label: z.string().trim().min(1).max(80).optional(), note: z.string().trim().max(200).nullish() }),
  z.object({ kind: z.literal("delete"), usageContextId: z.string().uuid() }),
  z.object({ kind: z.literal("reorder"), learningItemId: z.string().min(1), orderedIds: z.array(z.string().uuid()).max(50) }),
]);

const usageContextActionSchema = z.object({
  learningItemId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  mutation: usageContextMutationSchema,
});

/** Spec 17 — creating, renaming, reordering, and removing a word's usage-context tabs. Authoring, so a writer may do it. */
export async function usageContextAction(
  input: z.infer<typeof usageContextActionSchema>,
): Promise<ActionResult<{ usageContextId: string | null }>> {
  return runAdminAction(async () => {
    const parsed = usageContextActionSchema.parse(input);
    const user = await requireUser();
    return mutateUsageContext({ ...parsed, actorUserId: user.id });
  });
}

const exampleMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), targetText: z.string().trim().min(1).max(500), translation: z.string().trim().min(1).max(500), usageContextId: z.string().uuid().nullish() }),
  z.object({ kind: z.literal("update"), exampleId: z.string().uuid(), targetText: z.string().trim().min(1).max(500).optional(), translation: z.string().trim().min(1).max(500).optional(), usageContextId: z.string().uuid().nullish() }),
  z.object({ kind: z.literal("delete"), exampleId: z.string().uuid() }),
  z.object({ kind: z.literal("reorder"), orderedIds: z.array(z.string().uuid()).max(100) }),
]);

const exampleActionSchema = z.object({
  learningItemId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  mutation: exampleMutationSchema,
});

/** Spec 17 — the example sentences themselves, for vocabulary and grammar alike. */
export async function itemExampleAction(
  input: z.infer<typeof exampleActionSchema>,
): Promise<ActionResult<{ exampleId: string | null }>> {
  return runAdminAction(async () => {
    const parsed = exampleActionSchema.parse(input);
    const user = await requireUser();
    return mutateItemExample({ ...parsed, actorUserId: user.id });
  });
}

const seedUsageContextsSchema = z.object({ learningItemId: z.string().min(1) });

/**
 * Spec 17 — fills a word's tabs from its confirmed dictionary entry's
 * inflected forms.
 *
 * Composed in the action layer, like the dictionary field promotion:
 * `domains/lexicon` supplies the forms, `domains/curriculum` decides which
 * become contexts, and `domains/admin` writes them. Additive by design —
 * forms that already seeded a context are skipped, so pressing it twice adds
 * nothing and pressing it after new dictionary data adds only what is new.
 */
export async function seedUsageContextsAction(
  input: z.infer<typeof seedUsageContextsSchema>,
): Promise<ActionResult<{ created: number; reason: string | null }>> {
  return runAdminAction(async () => {
    const { learningItemId } = seedUsageContextsSchema.parse(input);
    const user = await requireUser();

    const view = await getVocabularyMappingView(learningItemId);
    if (view.mapping?.matchStatus !== "manual" || !view.entry) {
      return { created: 0, reason: "Confirm a dictionary match for this word first — the tabs come from its forms." };
    }

    const existing = await getUsageContexts(learningItemId);
    const proposed = proposeUsageContexts({
      lemma: view.entry.lemma,
      forms: view.entry.forms.map((form) => ({ form: form.form, tags: form.tags })),
      existingSourceForms: existing.map((context) => context.sourceForm).filter((form): form is string => form !== null),
    });

    if (proposed.length === 0) {
      return { created: 0, reason: "The dictionary lists no inflected forms for this word beyond the word itself." };
    }

    for (const context of proposed) {
      await mutateUsageContext({
        learningItemId,
        actorUserId: user.id,
        idempotencyKey: crypto.randomUUID(),
        mutation: { kind: "create", learningItemId, label: context.label, note: context.note, sourceForm: context.sourceForm },
      });
    }
    return { created: proposed.length, reason: null };
  });
}

const publishItemActionSchema = z.object({
  learningItemId: z.string().min(1),
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1),
});

export async function publishItemAction(input: z.infer<typeof publishItemActionSchema>): Promise<ActionResult<void>> {
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
    const parsed = archiveItemActionSchema.parse(input);
    const user = await requireUser();
    await archiveItem({ ...parsed, actorUserId: user.id });
  });
}

const deleteItemActionSchema = z.object({ learningItemId: z.string().min(1), idempotencyKey: z.string().min(1) });

export async function deleteItemAction(input: z.infer<typeof deleteItemActionSchema>) {
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
    const parsed = createLevelActionSchema.parse(input);
    const user = await requireUser();
    return createLevel({ ...parsed, actorUserId: user.id });
  });
}


const updateLevelActionSchema = z.object({
  levelId: z.string().min(1),
  name: z.string().trim().min(1).nullish(),
  status: curriculumStatusActionSchema.optional(),
  idempotencyKey: z.string().min(1),
});

export async function updateLevelAction(input: z.infer<typeof updateLevelActionSchema>): Promise<ActionResult<void>> {
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
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
  return runPublishAction(async () => {
    const parsed = bulkPublishPendingItemsActionSchema.parse(input);
    const user = await requireUser();
    await bulkPublishPendingItems({ ...parsed, actorUserId: user.id });
  });
}
