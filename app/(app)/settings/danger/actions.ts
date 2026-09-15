"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ContentTypeResetResult } from "@/domains/danger-zone";
import { isResetTarget } from "@/domains/danger-zone";
import { resetContentTypeReviews, resetToLevel } from "@/domains/danger-zone/server";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const resetContentTypeReviewsInputSchema = z.object({
  contentType: z.enum(["grammar", "vocabulary"]),
  target: z.string().refine(isResetTarget, "That reset option isn't valid."),
  idempotencyKey: z.string().min(1),
});

/**
 * Spec 20 Danger Zone — "Reset Grammar"/"Reset Vocabulary". One action for
 * both dropdowns, `contentType` the only differing input, matching
 * `resetContentTypeReviews`'s own "shared reset service" design.
 */
export async function resetContentTypeReviewsAction(
  input: z.infer<typeof resetContentTypeReviewsInputSchema>,
): Promise<ActionResult<ContentTypeResetResult>> {
  try {
    const parsed = resetContentTypeReviewsInputSchema.parse(input);
    const user = await requireUser();

    const result = await resetContentTypeReviews({
      userId: user.id,
      languageId: user.activeLanguageId,
      contentType: parsed.contentType,
      target: parsed.target,
      idempotencyKey: parsed.idempotencyKey,
    });

    revalidatePath("/settings/danger");
    revalidatePath("/dashboard");
    revalidatePath("/reviews");

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected reset content type reviews action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not complete the reset. Please try again." } };
  }
}

const resetToLevelInputSchema = z.object({
  targetLevelNumber: z.number().int().min(1),
  idempotencyKey: z.string().min(1),
});

/** Spec 20 Danger Zone — Reset to Level. */
export async function resetToLevelAction(
  input: z.infer<typeof resetToLevelInputSchema>,
): Promise<ActionResult<ContentTypeResetResult>> {
  try {
    const parsed = resetToLevelInputSchema.parse(input);
    const user = await requireUser();

    const result = await resetToLevel({
      userId: user.id,
      languageId: user.activeLanguageId,
      targetLevelNumber: parsed.targetLevelNumber,
      idempotencyKey: parsed.idempotencyKey,
    });

    revalidatePath("/settings/danger");
    revalidatePath("/dashboard");
    revalidatePath("/reviews");
    revalidatePath("/lessons");
    revalidatePath("/decks");

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected reset to level action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not complete the reset. Please try again." } };
  }
}
