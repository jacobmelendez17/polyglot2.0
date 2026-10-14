import { z } from "zod";

import {
  CURRICULUM_BULK_ITEM_LIMIT,
  CURRICULUM_REORDER_LIMIT,
} from "./curriculum-bulk-limits";

/** Same permissive UUID-shape reasoning as `domains/admin/audit-schemas.ts`. */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

/** Mirrors `registerEnum` exactly. A literal list rather than a derived one, matching how every other enum is validated in this file. */
const registerSchema = z.enum([
  "neutral",
  "formal",
  "informal",
  "colloquial",
  "slang",
  "vulgar",
  "literary",
]);

const acceptedAnswerSchema = z.object({
  side: z.enum(["term", "meaning"]),
  value: z.string().trim().min(1),
});

const vocabularyFieldsSchema = z.object({
  vocabularyGroupId: uuidLike,
  term: z.string().trim().min(1),
  primaryMeaning: z.string().trim().min(1),
  definition: z.string().trim().min(1).nullish(),
  article: z.string().trim().min(1).nullish(),
  partOfSpeech: z.string().trim().min(1),
  pronunciation: z.string().trim().min(1).nullish(),
  ipa: z.string().trim().min(1).nullish(),
  context: z.string().trim().min(1).nullish(),
  creatorNotes: z.string().trim().min(1).nullish(),
  register: registerSchema.nullish(),
  acceptedAnswers: z.array(acceptedAnswerSchema),
});

const grammarQuestionRequirementSchema = z.object({
  format: z.literal("translation"),
  direction: z.enum(["targetToEnglish", "englishToTarget"]),
});

const grammarFieldsSchema = z.object({
  title: z.string().trim().min(1).nullish(),
  structure: z.string().trim().min(1),
  primaryMeaning: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  category: z.string().trim().min(1).nullish(),
  vocabularyGroupId: uuidLike.nullish(),
  creatorNotes: z.string().trim().min(1).nullish(),
  requiredQuestions: z.array(grammarQuestionRequirementSchema).min(1),
  register: registerSchema.nullish(),
  acceptedAnswers: z.array(acceptedAnswerSchema),
});

const itemFieldsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vocabulary"), fields: vocabularyFieldsSchema }),
  z.object({ type: z.literal("grammar"), fields: grammarFieldsSchema }),
]);

export const createLearningItemInputSchema = z.intersection(
  z.object({
    languageId: uuidLike,
    levelId: uuidLike,
    actorUserId: uuidLike,
    approvedAsHomonymOf: uuidLike.nullish(),
  }),
  itemFieldsSchema,
);

export const updateLearningItemInputSchema = z.intersection(
  z.object({
    learningItemId: uuidLike,
    actorUserId: uuidLike,
    approvedAsHomonymOf: uuidLike.nullish(),
  }),
  itemFieldsSchema,
);

export const publishLearningItemInputSchema = z.object({
  learningItemId: uuidLike,
  actorUserId: uuidLike,
  expectedVersion: z.number().int().min(1),
});

export const archiveLearningItemInputSchema = z.object({
  learningItemId: uuidLike,
  actorUserId: uuidLike,
  reason: z.string().trim().min(1).optional(),
});

export const deleteLearningItemInputSchema = z.object({
  learningItemId: uuidLike,
  actorUserId: uuidLike,
});

export const moveLearningItemInputSchema = z
  .object({
    learningItemId: uuidLike,
    actorUserId: uuidLike,
    levelId: uuidLike.optional(),
    vocabularyGroupId: uuidLike.optional(),
  })
  .refine((input) => input.levelId ?? input.vocabularyGroupId, {
    message: "A move must change at least the level or the group",
  });

/** Each item at most once — a repeated id would be archived, moved or numbered twice. Compared without regard to case, as the database does. */
const namedOnce = (ids: string[]) =>
  new Set(ids.map((id) => id.toLowerCase())).size === ids.length;

export const reorderLearningItemsInputSchema = z.object({
  actorUserId: uuidLike,
  levelId: uuidLike,
  type: z.enum(["vocabulary", "grammar"]),
  orderedLearningItemIds: z
    .array(uuidLike)
    .min(1)
    .max(CURRICULUM_REORDER_LIMIT)
    .refine(namedOnce, { message: "Each item can be named only once." }),
});

const curriculumStatusSchema = z.enum([
  "draft",
  "pending",
  "published",
  "archived",
]);

export const createLevelInputSchema = z.object({
  languageId: uuidLike,
  levelNumber: z.number().int().min(1),
  name: z.string().trim().min(1).nullish(),
  actorUserId: uuidLike,
});

/**
 * A curriculum target. `null` restores the configured default; `0` means the
 * level requires none of that content. The upper bound is generous but
 * finite — a target is a curriculum decision, not free-form input, and an
 * absurd value would make the publish gate unsatisfiable rather than strict.
 */
const levelTargetSchema = z.number().int().min(0).max(1000).nullish();

export const updateLevelInputSchema = z.object({
  levelId: uuidLike,
  actorUserId: uuidLike,
  name: z.string().trim().min(1).nullish(),
  status: curriculumStatusSchema.optional(),
  targets: z
    .object({
      vocabularyItems: levelTargetSchema,
      vocabularyGroups: levelTargetSchema,
      grammarItems: levelTargetSchema,
    })
    .optional(),
});

export const createVocabularyGroupInputSchema = z.object({
  levelId: uuidLike,
  languageId: uuidLike,
  name: z.string().trim().min(1),
  actorUserId: uuidLike,
});

export const updateVocabularyGroupInputSchema = z.object({
  groupId: uuidLike,
  actorUserId: uuidLike,
  name: z.string().trim().min(1).optional(),
  status: curriculumStatusSchema.optional(),
});

export const reorderVocabularyGroupsInputSchema = z.object({
  actorUserId: uuidLike,
  levelId: uuidLike,
  orderedGroupIds: z.array(uuidLike).min(1),
});

/** A bulk command names between one and `CURRICULUM_BULK_ITEM_LIMIT` distinct items. */
const bulkLearningItemIdsSchema = z
  .array(uuidLike)
  .min(1)
  .max(CURRICULUM_BULK_ITEM_LIMIT)
  .refine(namedOnce, { message: "Each item can be named only once." });

export const bulkArchiveLearningItemsInputSchema = z.object({
  languageId: uuidLike,
  learningItemIds: bulkLearningItemIdsSchema,
  actorUserId: uuidLike,
  reason: z.string().trim().min(1).optional(),
});

export const bulkMoveLearningItemsInputSchema = z
  .object({
    languageId: uuidLike,
    learningItemIds: bulkLearningItemIdsSchema,
    actorUserId: uuidLike,
    levelId: uuidLike.optional(),
    vocabularyGroupId: uuidLike.optional(),
  })
  .refine((input) => input.levelId ?? input.vocabularyGroupId, {
    message: "A bulk move must change at least the level or the group",
  });

export const bulkPublishPendingItemsInputSchema = z.object({
  languageId: uuidLike,
  learningItemIds: bulkLearningItemIdsSchema,
  actorUserId: uuidLike,
});
