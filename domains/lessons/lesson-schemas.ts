import { z } from "zod";

/**
 * The signed ephemeral lesson-state shape (spec 07 §7). Zod is the source of
 * truth — types are inferred from these schemas — so the decoded token
 * payload is always re-validated at the trust boundary in
 * `lesson-token.ts`'s `verifyLessonState`, per code-standards.md's rule that
 * external/untrusted data must be validated at runtime, and spec 07 §62's
 * explicit instruction to validate the token with a Zod boundary schema.
 */

export const lessonPhaseSchema = z.enum(["study", "quiz", "complete"]);

export const learningItemTypeSchema = z.enum(["vocabulary", "grammar"]);

export const quizQuestionDirectionSchema = z.enum(["targetToEnglish", "englishToTarget"]);

export const lessonBatchItemSchema = z.object({
  itemId: z.string().min(1),
  itemType: learningItemTypeSchema,
});

export const quizQuestionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  itemType: learningItemTypeSchema,
  direction: quizQuestionDirectionSchema,
});

export const lessonQuizStateSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1),
  satisfiedQuestionIds: z.array(z.string().min(1)),
  queue: z.array(z.string().min(1)),
  attempts: z.number().int().min(0),
  correctAttempts: z.number().int().min(0),
});

export const lessonStateSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  languageId: z.string().min(1),
  batch: z.array(lessonBatchItemSchema).min(1),
  viewedItemIds: z.array(z.string().min(1)),
  phase: lessonPhaseSchema,
  quiz: lessonQuizStateSchema.optional(),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});
