"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, setActiveLanguage } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * Saving the language-choice step (2026-09-26, spec 15/16's onboarding flow
 * — before the curriculum choice, same shape as `onboarding/curriculum/
 * actions.ts`'s `setCurriculumPreferenceAction`).
 *
 * The learner is resolved server-side, so nothing a client sends can set
 * another account's active language. `languageId` is checked against the
 * real `languages` table inside `setActiveLanguage` itself (it throws
 * `ITEM_NOT_FOUND` for anything else), never trusted as a bare id.
 *
 * A sandbox persona is refused outright, exactly as the curriculum
 * preference and onboarding completion actions are — Sandbox previews
 * change nothing.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Same permissive UUID-shape reasoning as `onboarding/curriculum/
 * actions.ts` — this codebase's seeded fixture ids don't satisfy
 * `z.uuid()`'s stricter RFC 4122 version check.
 */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid language",
  );

const inputSchema = z.object({ languageId: uuidLike });

export async function setActiveLanguageAction(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<null>> {
  try {
    const { languageId } = inputSchema.parse(input);
    const user = await requireUser();

    if (user.isSandbox) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Sandbox previews don't change your language.",
        },
      };
    }

    await setActiveLanguage({ userId: user.id, languageId });

    // Every page reads `user.activeLanguageId` fresh per request, but the
    // onboarding/curriculum step (next) and the dashboard both already
    // rendered against the old language on this navigation.
    revalidatePath("/onboarding/curriculum");
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
    console.error("Unexpected active-language action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
