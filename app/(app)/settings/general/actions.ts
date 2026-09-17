"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isSupportedTimezone } from "@/lib/time/timezones";
import type { ContentPreferences } from "@/domains/users";
import {
  disableVacationMode,
  enableVacationMode,
  requireUser,
  updateContentPreferences,
  updateTimezone,
} from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const timezoneInputSchema = z.object({
  timezone: z
    .string()
    .refine(isSupportedTimezone, "That isn't a recognized timezone."),
});

// At least one field, and at most the two real ones — the payload always
// carries only the toggle that actually changed (spec 20's narrow-mutation
// rule), never a full settings object.
const contentPreferencesInputSchema = z
  .object({
    hideEnglishReviews: z.boolean().optional(),
    showNsfwContent: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.hideEnglishReviews !== undefined ||
      input.showNsfwContent !== undefined,
    {
      message: "No preference was provided to update.",
    },
  );

/**
 * Spec 20 General — Timezone. `isSupportedTimezone` is the same runtime
 * `Intl` list the picker is built from, so the server never accepts a value
 * the client couldn't have offered.
 */
export async function updateTimezoneAction(
  input: z.infer<typeof timezoneInputSchema>,
): Promise<ActionResult<{ timezone: string }>> {
  try {
    const { timezone } = timezoneInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateTimezone({ userId: user.id, timezone });

    // Timezone affects displayed dates/times, streak day boundaries, and
    // Start-of-Day Review Queue Timing across the app.
    revalidatePath("/settings/general");
    revalidatePath("/dashboard");

    return { ok: true, data: { timezone: updated.timezone } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: error.issues[0]?.message ?? "That timezone isn't valid.",
        },
      };
    }
    console.error("Unexpected update timezone action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    };
  }
}

/**
 * Spec 20 General — Content preferences. NSFW filtering is enforced
 * server-side wherever it's wired (see `domains/curriculum`'s
 * `databaseCurriculumReader`) — this action only ever stores the
 * preference; it never itself decides what content a learner sees.
 */
export async function updateContentPreferencesAction(
  input: z.infer<typeof contentPreferencesInputSchema>,
): Promise<ActionResult<ContentPreferences>> {
  try {
    const parsed = contentPreferencesInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateContentPreferences(user.id, parsed);

    revalidatePath("/settings/general");
    if (parsed.showNsfwContent !== undefined) {
      // NSFW visibility affects which lesson items are selected.
      revalidatePath("/lessons");
    }

    return { ok: true, data: updated };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: error.issues[0]?.message ?? "That request isn't valid.",
        },
      };
    }
    console.error("Unexpected update content preferences action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    };
  }
}

/**
 * Spec 20 General — Vacation Mode. Two narrow actions (spec's own
 * `enableVacationMode`/`disableVacationMode` naming) rather than one toggle
 * action, since the two directions do genuinely different things
 * server-side — disabling is the one that reconciles every scheduled
 * review, enabling just opens the period.
 */
export async function enableVacationModeAction(): Promise<
  ActionResult<{ vacationModeEnabled: true }>
> {
  try {
    const user = await requireUser();
    await enableVacationMode(user.id);

    revalidatePath("/settings/general");
    revalidatePath("/dashboard");
    revalidatePath("/reviews");

    return { ok: true, data: { vacationModeEnabled: true } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    console.error("Unexpected enable vacation mode action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    };
  }
}

export async function disableVacationModeAction(): Promise<
  ActionResult<{ vacationModeEnabled: false }>
> {
  try {
    const user = await requireUser();
    await disableVacationMode(user.id);

    revalidatePath("/settings/general");
    revalidatePath("/dashboard");
    revalidatePath("/reviews");

    return { ok: true, data: { vacationModeEnabled: false } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    console.error("Unexpected disable vacation mode action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    };
  }
}
