"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CURRICULUM_MODES, GRAMMAR_PLACEMENTS, MAX_LESSON_BATCH_SIZE, MIN_LESSON_BATCH_SIZE } from "@/domains/users";
import { listAvailableThemes } from "@/domains/lessons/server";
import { requireUser, updateAutoPronounceLessons, updateGrammarPlacement, updateLessonBatchSize } from "@/domains/users/server";
import { setCurriculumPreference } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const curriculumPreferenceInputSchema = z.object({
  curriculumMode: z.enum(CURRICULUM_MODES),
  selectedVocabularyGroupId: z.string().uuid().nullish(),
});

/**
 * Spec 20 Lessons — Learning Queue. Same shape as onboarding's
 * `setCurriculumPreferenceAction`
 * (`app/(onboarding)/onboarding/curriculum/actions.ts`) — deliberately not
 * shared code, since the two live in different route trees and this one
 * saves immediately on every change rather than behind a "Continue"
 * button, but the underlying validation and the exact reasons for it
 * (never trust a client-supplied theme id; a sandbox persona's preference
 * is set only through the Sandbox, audited) are identical.
 */
export async function updateCurriculumPreferenceAction(
  input: z.infer<typeof curriculumPreferenceInputSchema>,
): Promise<ActionResult<{ curriculumMode: string; selectedVocabularyGroupId: string | null }>> {
  try {
    const { curriculumMode, selectedVocabularyGroupId } = curriculumPreferenceInputSchema.parse(input);
    const user = await requireUser();

    if (user.isSandbox) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Sandbox previews don't change your preference." } };
    }

    let themeId: string | null = null;
    if (curriculumMode === "choose_group" && selectedVocabularyGroupId) {
      const themes = await listAvailableThemes({ userId: user.id, languageId: user.activeLanguageId });
      if (!themes.some((theme) => theme.id === selectedVocabularyGroupId)) {
        return { ok: false, error: { code: "THEME_UNAVAILABLE", message: "That group isn't available to study right now." } };
      }
      themeId = selectedVocabularyGroupId;
    }

    const updated = await setCurriculumPreference({
      userId: user.id,
      languageId: user.activeLanguageId,
      curriculumMode,
      selectedVocabularyGroupId: themeId,
    });

    revalidatePath("/settings/lessons");
    revalidatePath("/lessons");

    return { ok: true, data: { curriculumMode: updated.curriculumMode, selectedVocabularyGroupId: updated.selectedVocabularyGroupId } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update curriculum preference action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}

const grammarPlacementInputSchema = z.object({
  grammarPlacement: z.enum(GRAMMAR_PLACEMENTS),
});

export async function updateGrammarPlacementAction(
  input: z.infer<typeof grammarPlacementInputSchema>,
): Promise<ActionResult<{ grammarPlacement: string }>> {
  try {
    const { grammarPlacement } = grammarPlacementInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateGrammarPlacement({ userId: user.id, languageId: user.activeLanguageId, grammarPlacement });

    revalidatePath("/settings/lessons");
    revalidatePath("/lessons");

    return { ok: true, data: { grammarPlacement: updated.grammarPlacement } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update grammar placement action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}

const lessonBatchSizeInputSchema = z.object({
  lessonBatchSize: z.number().int().min(MIN_LESSON_BATCH_SIZE).max(MAX_LESSON_BATCH_SIZE),
});

export async function updateLessonBatchSizeAction(
  input: z.infer<typeof lessonBatchSizeInputSchema>,
): Promise<ActionResult<{ lessonBatchSize: number }>> {
  try {
    const { lessonBatchSize } = lessonBatchSizeInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateLessonBatchSize({ userId: user.id, languageId: user.activeLanguageId, lessonBatchSize });

    revalidatePath("/settings/lessons");
    revalidatePath("/lessons");

    return { ok: true, data: { lessonBatchSize: updated.lessonBatchSize } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update lesson batch size action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}

const autoPronounceLessonsInputSchema = z.object({
  autoPronounceLessons: z.boolean(),
});

export async function updateAutoPronounceLessonsAction(
  input: z.infer<typeof autoPronounceLessonsInputSchema>,
): Promise<ActionResult<{ autoPronounceLessons: boolean }>> {
  try {
    const { autoPronounceLessons } = autoPronounceLessonsInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateAutoPronounceLessons({ userId: user.id, languageId: user.activeLanguageId, autoPronounceLessons });

    revalidatePath("/settings/lessons");
    revalidatePath("/lessons");

    return { ok: true, data: { autoPronounceLessons: updated.autoPronounceLessons } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update auto pronounce lessons action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}
