"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { REVIEW_TYPES } from "@/domains/srs";
import { requireUser } from "@/domains/users/server";
import { updateGrammarReviewType, updateVocabularyReviewType } from "@/domains/srs/server";
import { AppError } from "@/lib/errors/app-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const reviewTypeInputSchema = z.object({
  reviewType: z.enum(REVIEW_TYPES),
});

/** Spec 20 Reviews — Grammar Review Type. */
export async function updateGrammarReviewTypeAction(
  input: z.infer<typeof reviewTypeInputSchema>,
): Promise<ActionResult<{ grammarReviewType: string }>> {
  try {
    const { reviewType } = reviewTypeInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateGrammarReviewType({ userId: user.id, languageId: user.activeLanguageId, reviewType });

    revalidatePath("/settings/reviews");

    return { ok: true, data: { grammarReviewType: updated.grammarReviewType } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update grammar review type action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}

/** Spec 20 Reviews — Vocabulary Review Type. */
export async function updateVocabularyReviewTypeAction(
  input: z.infer<typeof reviewTypeInputSchema>,
): Promise<ActionResult<{ vocabularyReviewType: string }>> {
  try {
    const { reviewType } = reviewTypeInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateVocabularyReviewType({ userId: user.id, languageId: user.activeLanguageId, reviewType });

    revalidatePath("/settings/reviews");

    return { ok: true, data: { vocabularyReviewType: updated.vocabularyReviewType } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update vocabulary review type action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}
