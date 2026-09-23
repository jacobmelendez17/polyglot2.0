"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CURRICULUM_MODES } from "@/domains/users";
import { listAvailableThemes } from "@/domains/lessons/server";
import { requireUser, setCurriculumPreference } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * Saving the curriculum preference (spec 16).
 *
 * The learner is resolved server-side, so nothing a client sends can set
 * another account's preference — the payload carries the choice and nothing
 * else. The chosen theme is validated against the themes this learner can
 * actually study right now rather than accepted on trust: a group id from
 * another level, another language, or an already-finished theme is a
 * request, not a fact.
 *
 * A sandbox persona is refused outright, exactly as onboarding completion
 * is. Sandbox previews change nothing, and the Sandbox's own controls write
 * a persona's mode through `domains/sandbox`, where it is audited.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Same permissive UUID-shape reasoning as `domains/admin/audit-schemas.ts`
 * — this codebase's seeded fixture IDs (e.g. `vocabulary_groups` rows like
 * `30000000-0000-0000-0000-000000000001`) don't satisfy `z.uuid()`'s
 * stricter RFC 4122 version check, which rejects them outright.
 */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

const inputSchema = z.object({
  curriculumMode: z.enum(CURRICULUM_MODES),
  selectedVocabularyGroupId: uuidLike.nullish(),
});

export async function setCurriculumPreferenceAction(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<null>> {
  try {
    const { curriculumMode, selectedVocabularyGroupId } =
      inputSchema.parse(input);
    const user = await requireUser();

    if (user.isSandbox) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Sandbox previews don't change your preference.",
        },
      };
    }

    let themeId: string | null = null;
    if (curriculumMode === "choose_group" && selectedVocabularyGroupId) {
      const themes = await listAvailableThemes({
        userId: user.id,
        languageId: user.activeLanguageId,
      });
      if (!themes.some((theme) => theme.id === selectedVocabularyGroupId)) {
        return {
          ok: false,
          error: {
            code: "THEME_UNAVAILABLE",
            message: "That theme isn't available to study right now.",
          },
        };
      }
      themeId = selectedVocabularyGroupId;
    }

    await setCurriculumPreference({
      userId: user.id,
      languageId: user.activeLanguageId,
      curriculumMode,
      selectedVocabularyGroupId: themeId,
    });

    // The next lesson is selected from this preference, and the dashboard
    // links straight into it.
    revalidatePath("/lessons");
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "That request could not be understood.",
        },
      };
    }
    console.error("Unexpected curriculum preference action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
