"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  HINT_MODES,
  HINT_ORDERS,
  REVIEW_QUEUE_TIMING_MODES,
  REVIEW_TYPES,
  REVIEW_UI_TOGGLE_FIELDS,
  SRS_INTERVAL_MODES,
  SRS_STRICTNESSES,
  UNDO_ACTIONS,
} from "@/domains/srs";
import { requireUser } from "@/domains/users/server";
import {
  updateGrammarFluentMode,
  updateGrammarHintMode,
  updateGrammarHintOrder,
  updateGrammarReviewType,
  updateGrammarSrsIntervalMode,
  updateGrammarSrsStrictness,
  updateReviewQueueTiming,
  updateReviewUiToggle,
  updateUndoAction,
  updateVocabularyFluentMode,
  updateVocabularyHintMode,
  updateVocabularyHintOrder,
  updateVocabularyReviewType,
  updateVocabularySrsIntervalMode,
  updateVocabularySrsStrictness,
} from "@/domains/srs/server";
import { AppError } from "@/lib/errors/app-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Every action below shares this try/catch shape — extracted once six new narrow mutations needed it alongside the two Review Type ones already using it by hand. */
async function runSettingsAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected review settings action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}

const reviewTypeInputSchema = z.object({ reviewType: z.enum(REVIEW_TYPES) });

/** Spec 20 Reviews — Grammar Review Type. */
export async function updateGrammarReviewTypeAction(
  input: z.infer<typeof reviewTypeInputSchema>,
): Promise<ActionResult<{ grammarReviewType: string }>> {
  return runSettingsAction(async () => {
    const { reviewType } = reviewTypeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateGrammarReviewType({ userId: user.id, languageId: user.activeLanguageId, reviewType });
    revalidatePath("/settings/reviews");
    return { grammarReviewType: updated.grammarReviewType };
  });
}

/** Spec 20 Reviews — Vocabulary Review Type. */
export async function updateVocabularyReviewTypeAction(
  input: z.infer<typeof reviewTypeInputSchema>,
): Promise<ActionResult<{ vocabularyReviewType: string }>> {
  return runSettingsAction(async () => {
    const { reviewType } = reviewTypeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateVocabularyReviewType({ userId: user.id, languageId: user.activeLanguageId, reviewType });
    revalidatePath("/settings/reviews");
    return { vocabularyReviewType: updated.vocabularyReviewType };
  });
}

const hintOrderInputSchema = z.object({ hintOrder: z.enum(HINT_ORDERS) });

/** Spec 20 Review Hints — Grammar Hint Order. */
export async function updateGrammarHintOrderAction(
  input: z.infer<typeof hintOrderInputSchema>,
): Promise<ActionResult<{ hintOrder: string }>> {
  return runSettingsAction(async () => {
    const { hintOrder } = hintOrderInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateGrammarHintOrder({ userId: user.id, languageId: user.activeLanguageId, hintOrder });
    revalidatePath("/settings/reviews");
    return { hintOrder: updated.grammarHintOrder };
  });
}

/** Spec 20 Review Hints — Vocabulary Hint Order. */
export async function updateVocabularyHintOrderAction(
  input: z.infer<typeof hintOrderInputSchema>,
): Promise<ActionResult<{ hintOrder: string }>> {
  return runSettingsAction(async () => {
    const { hintOrder } = hintOrderInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateVocabularyHintOrder({ userId: user.id, languageId: user.activeLanguageId, hintOrder });
    revalidatePath("/settings/reviews");
    return { hintOrder: updated.vocabularyHintOrder };
  });
}

const hintModeInputSchema = z.object({ hintMode: z.enum(HINT_MODES) });

/** Spec 20 Review Hints — Grammar Hint Mode. */
export async function updateGrammarHintModeAction(
  input: z.infer<typeof hintModeInputSchema>,
): Promise<ActionResult<{ hintMode: string }>> {
  return runSettingsAction(async () => {
    const { hintMode } = hintModeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateGrammarHintMode({ userId: user.id, languageId: user.activeLanguageId, hintMode });
    revalidatePath("/settings/reviews");
    return { hintMode: updated.grammarHintMode };
  });
}

/** Spec 20 Review Hints — Vocabulary Hint Mode. */
export async function updateVocabularyHintModeAction(
  input: z.infer<typeof hintModeInputSchema>,
): Promise<ActionResult<{ hintMode: string }>> {
  return runSettingsAction(async () => {
    const { hintMode } = hintModeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateVocabularyHintMode({ userId: user.id, languageId: user.activeLanguageId, hintMode });
    revalidatePath("/settings/reviews");
    return { hintMode: updated.vocabularyHintMode };
  });
}

const reviewUiToggleInputSchema = z.object({
  field: z.enum(REVIEW_UI_TOGGLE_FIELDS),
  value: z.boolean(),
});

/** Spec 20 Review UI — any of the seven independent boolean toggles (Autoplay Audio, Lightning Mode, Focus Mode, Auto Highlight Errors, Show SRS Stage, Auto-Expand Info). */
export async function updateReviewUiToggleAction(
  input: z.infer<typeof reviewUiToggleInputSchema>,
): Promise<ActionResult<{ value: boolean }>> {
  return runSettingsAction(async () => {
    const { field, value } = reviewUiToggleInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateReviewUiToggle({ userId: user.id, languageId: user.activeLanguageId, field, value });
    revalidatePath("/settings/reviews");
    return { value: updated[field] };
  });
}

const undoActionInputSchema = z.object({ undoAction: z.enum(UNDO_ACTIONS) });

/** Spec 20 Review UI — Undo Action. */
export async function updateUndoActionAction(
  input: z.infer<typeof undoActionInputSchema>,
): Promise<ActionResult<{ undoAction: string }>> {
  return runSettingsAction(async () => {
    const { undoAction } = undoActionInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateUndoAction({ userId: user.id, languageId: user.activeLanguageId, undoAction });
    revalidatePath("/settings/reviews");
    return { undoAction: updated.undoAction };
  });
}

const srsStrictnessInputSchema = z.object({ srsStrictness: z.enum(SRS_STRICTNESSES) });

/** Spec 20 SRS Strictness — Grammar SRS Strictness. */
export async function updateGrammarSrsStrictnessAction(
  input: z.infer<typeof srsStrictnessInputSchema>,
): Promise<ActionResult<{ srsStrictness: string }>> {
  return runSettingsAction(async () => {
    const { srsStrictness } = srsStrictnessInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateGrammarSrsStrictness({ userId: user.id, languageId: user.activeLanguageId, srsStrictness });
    revalidatePath("/settings/reviews");
    return { srsStrictness: updated.grammarSrsStrictness };
  });
}

/** Spec 20 SRS Strictness — Vocabulary SRS Strictness. */
export async function updateVocabularySrsStrictnessAction(
  input: z.infer<typeof srsStrictnessInputSchema>,
): Promise<ActionResult<{ srsStrictness: string }>> {
  return runSettingsAction(async () => {
    const { srsStrictness } = srsStrictnessInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateVocabularySrsStrictness({ userId: user.id, languageId: user.activeLanguageId, srsStrictness });
    revalidatePath("/settings/reviews");
    return { srsStrictness: updated.vocabularySrsStrictness };
  });
}

const srsIntervalModeInputSchema = z.object({ srsIntervalMode: z.enum(SRS_INTERVAL_MODES) });

/** Spec 20 SRS Interval — Grammar SRS Interval. */
export async function updateGrammarSrsIntervalModeAction(
  input: z.infer<typeof srsIntervalModeInputSchema>,
): Promise<ActionResult<{ srsIntervalMode: string }>> {
  return runSettingsAction(async () => {
    const { srsIntervalMode } = srsIntervalModeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateGrammarSrsIntervalMode({ userId: user.id, languageId: user.activeLanguageId, srsIntervalMode });
    revalidatePath("/settings/reviews");
    return { srsIntervalMode: updated.grammarSrsIntervalMode };
  });
}

/** Spec 20 SRS Interval — Vocabulary SRS Interval. */
export async function updateVocabularySrsIntervalModeAction(
  input: z.infer<typeof srsIntervalModeInputSchema>,
): Promise<ActionResult<{ srsIntervalMode: string }>> {
  return runSettingsAction(async () => {
    const { srsIntervalMode } = srsIntervalModeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateVocabularySrsIntervalMode({ userId: user.id, languageId: user.activeLanguageId, srsIntervalMode });
    revalidatePath("/settings/reviews");
    return { srsIntervalMode: updated.vocabularySrsIntervalMode };
  });
}

const reviewQueueTimingInputSchema = z.object({ reviewQueueTiming: z.enum(REVIEW_QUEUE_TIMING_MODES) });

/** Spec 20 Review Queue Timing — one value per language, not split grammar/vocabulary. */
export async function updateReviewQueueTimingAction(
  input: z.infer<typeof reviewQueueTimingInputSchema>,
): Promise<ActionResult<{ reviewQueueTiming: string }>> {
  return runSettingsAction(async () => {
    const { reviewQueueTiming } = reviewQueueTimingInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateReviewQueueTiming({ userId: user.id, languageId: user.activeLanguageId, reviewQueueTiming });
    revalidatePath("/settings/reviews");
    return { reviewQueueTiming: updated.reviewQueueTiming };
  });
}

const fluentModeInputSchema = z.object({ fluentMode: z.boolean() });

/** Spec 20 Fluent Mode — Grammar Fluent Mode. */
export async function updateGrammarFluentModeAction(
  input: z.infer<typeof fluentModeInputSchema>,
): Promise<ActionResult<{ fluentMode: boolean }>> {
  return runSettingsAction(async () => {
    const { fluentMode } = fluentModeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateGrammarFluentMode({ userId: user.id, languageId: user.activeLanguageId, fluentMode });
    revalidatePath("/settings/reviews");
    return { fluentMode: updated.grammarFluentMode };
  });
}

/** Spec 20 Fluent Mode — Vocabulary Fluent Mode. */
export async function updateVocabularyFluentModeAction(
  input: z.infer<typeof fluentModeInputSchema>,
): Promise<ActionResult<{ fluentMode: boolean }>> {
  return runSettingsAction(async () => {
    const { fluentMode } = fluentModeInputSchema.parse(input);
    const user = await requireUser();
    const updated = await updateVocabularyFluentMode({ userId: user.id, languageId: user.activeLanguageId, fluentMode });
    revalidatePath("/settings/reviews");
    return { fluentMode: updated.vocabularyFluentMode };
  });
}
