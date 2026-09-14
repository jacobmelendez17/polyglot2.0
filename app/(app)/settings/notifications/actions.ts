"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { NotificationPreferences } from "@/domains/users";
import { requireUser, updateNotificationPreferences } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

// At least one field, and at most the four real ones — the payload always
// carries only the toggle that actually changed (spec 20's narrow-mutation
// rule), never a full preferences object.
const notificationPreferencesInputSchema = z
  .object({
    newsUpdates: z.boolean().optional(),
    progressEmail: z.boolean().optional(),
    inactivityEmail: z.boolean().optional(),
    trialEmail: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.newsUpdates !== undefined ||
      input.progressEmail !== undefined ||
      input.inactivityEmail !== undefined ||
      input.trialEmail !== undefined,
    { message: "No preference was provided to update." },
  );

/**
 * Spec 20 Notifications. Stores a preference only — no email is ever sent
 * from this action or anywhere else in the codebase, matching the spec's
 * "the actual optional email-delivery provider/workflow is deferred."
 */
export async function updateNotificationPreferencesAction(
  input: z.infer<typeof notificationPreferencesInputSchema>,
): Promise<ActionResult<NotificationPreferences>> {
  try {
    const parsed = notificationPreferencesInputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateNotificationPreferences(user.id, parsed);

    revalidatePath("/settings/notifications");

    return { ok: true, data: updated };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That request isn't valid." } };
    }
    console.error("Unexpected update notification preferences action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}
