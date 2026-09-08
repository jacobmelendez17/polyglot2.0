"use server";

import { z } from "zod";

import { gradeDeckPracticeAnswer } from "@/domains/decks/server";
import type { DeckPracticeFeedback } from "@/domains/decks";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { DeckError } from "@/lib/errors/deck-errors";

/**
 * The one Server Action deck practice needs (spec 14). It grades an answer
 * and returns feedback — it persists nothing, so there is no idempotency key
 * and no completion call. SRS stage, next review time, review statistics,
 * level unlocks, and curriculum progress are all untouched by this path.
 *
 * The learner's typed answer is never logged (architecture.md's privacy
 * rules), exactly as in the review flow.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

const gradeAnswerSchema = z.object({
  deckId: uuidLike,
  learningItemId: uuidLike,
  direction: z.enum(["targetToEnglish", "englishToTarget"]),
  answer: z.string().max(500),
});

export async function gradeDeckPracticeAnswerAction(
  input: z.infer<typeof gradeAnswerSchema>,
): Promise<ActionResult<DeckPracticeFeedback>> {
  try {
    const parsed = gradeAnswerSchema.parse(input);
    const user = await requireUser();
    const feedback = await gradeDeckPracticeAnswer({
      userId: user.id,
      languageId: user.activeLanguageId,
      deckId: parsed.deckId,
      learningItemId: parsed.learningItemId,
      direction: parsed.direction,
      answer: parsed.answer,
    });
    return { ok: true, data: feedback };
  } catch (error) {
    if (error instanceof DeckError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "DECK_VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected deck practice action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}
