"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ContentTypeResetResult } from "@/domains/danger-zone";
import { isResetTarget } from "@/domains/danger-zone";
import {
  resetContentTypeReviews,
  resetDismissedWarnings,
  resetEntireAccount,
  resetToLevel,
  setManualStreak,
} from "@/domains/danger-zone/server";
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

const setManualStreakInputSchema = z.object({
  value: z.number().int().min(0).max(100000),
  idempotencyKey: z.string().min(1),
});

/** Spec 20 Danger Zone — Manually Set Streak. */
export async function setManualStreakAction(
  input: z.infer<typeof setManualStreakInputSchema>,
): Promise<ActionResult<{ value: number }>> {
  try {
    const parsed = setManualStreakInputSchema.parse(input);
    const user = await requireUser();

    const result = await setManualStreak({ userId: user.id, value: parsed.value, idempotencyKey: parsed.idempotencyKey });

    revalidatePath("/settings/danger");
    revalidatePath("/dashboard");

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected set manual streak action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save the streak. Please try again." } };
  }
}

const resetDismissedWarningsInputSchema = z.object({
  idempotencyKey: z.string().min(1),
});

/** Spec 20 Danger Zone — Reset Dismissable Warnings. */
export async function resetDismissedWarningsAction(
  input: z.infer<typeof resetDismissedWarningsInputSchema>,
): Promise<ActionResult<{ affectedItemCount: number }>> {
  try {
    const parsed = resetDismissedWarningsInputSchema.parse(input);
    const user = await requireUser();

    const result = await resetDismissedWarnings({ userId: user.id, idempotencyKey: parsed.idempotencyKey });

    revalidatePath("/settings/danger");

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected reset dismissed warnings action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not reset warnings. Please try again." } };
  }
}

const resetEntireAccountInputSchema = z.object({
  idempotencyKey: z.string().min(1),
});

/**
 * Spec 20 Danger Zone — Reset Entire Account. The single most destructive
 * per-account operation short of Delete Account — the "strong confirmation
 * dialog" the spec asks for is enforced client-side (typed confirmation
 * phrase) before this is ever called, but that is a UX convenience, not
 * the authoritative gate: this action itself is the actual barrier
 * ("server-side confirmation remains authoritative").
 */
export async function resetEntireAccountAction(
  input: z.infer<typeof resetEntireAccountInputSchema>,
): Promise<ActionResult<{ resetAt: string }>> {
  try {
    const parsed = resetEntireAccountInputSchema.parse(input);
    const user = await requireUser();

    const result = await resetEntireAccount({ userId: user.id, idempotencyKey: parsed.idempotencyKey });

    // Every page a stale value from this account could still be showing.
    revalidatePath("/", "layout");

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected reset entire account action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not reset your account. Please try again." } };
  }
}
