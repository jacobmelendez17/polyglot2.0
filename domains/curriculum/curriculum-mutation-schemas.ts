import { z } from "zod";

/** Same permissive UUID-shape reasoning as `domains/admin/audit-schemas.ts`. */
const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

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
  creatorNotes: z.string().trim().min(1).nullish(),
  requiredQuestions: z.array(grammarQuestionRequirementSchema).min(1),
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

export const reorderLearningItemsInputSchema = z.object({
  actorUserId: uuidLike,
  levelId: uuidLike,
  type: z.enum(["vocabulary", "grammar"]),
  orderedLearningItemIds: z.array(uuidLike).min(1),
});

const curriculumStatusSchema = z.enum(["draft", "pending", "published", "archived"]);

export const createLevelInputSchema = z.object({
  languageId: uuidLike,
  levelNumber: z.number().int().min(1),
  name: z.string().trim().min(1).nullish(),
  actorUserId: uuidLike,
});

export const updateLevelInputSchema = z.object({
  levelId: uuidLike,
  actorUserId: uuidLike,
  name: z.string().trim().min(1).nullish(),
  status: curriculumStatusSchema.optional(),
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

export const bulkArchiveLearningItemsInputSchema = z.object({
  learningItemIds: z.array(uuidLike).min(1),
  actorUserId: uuidLike,
  reason: z.string().trim().min(1).optional(),
});

export const bulkMoveLearningItemsInputSchema = z
  .object({
    learningItemIds: z.array(uuidLike).min(1),
    actorUserId: uuidLike,
    levelId: uuidLike.optional(),
    vocabularyGroupId: uuidLike.optional(),
  })
  .refine((input) => input.levelId ?? input.vocabularyGroupId, {
    message: "A bulk move must change at least the level or the group",
  });

export const bulkPublishPendingItemsInputSchema = z.object({
  learningItemIds: z.array(uuidLike).min(1),
  actorUserId: uuidLike,
});
