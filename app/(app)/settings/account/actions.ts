"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, updateName } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * Spec 20 Account — Name. Follows the same narrow-mutation Server Action
 * shape as `setCurriculumPreferenceAction`: the payload carries only the new
 * value, the authenticated user is resolved server-side, and every expected
 * failure returns a structured `{ ok: false, error }` rather than throwing
 * past the client boundary.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const inputSchema = z.object({
  displayName: z.string().trim().min(1, "Name can't be empty.").max(80, "That name is too long."),
});

export async function updateNameAction(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<{ displayName: string | null }>> {
  try {
    const { displayName } = inputSchema.parse(input);
    const user = await requireUser();

    const updated = await updateName({ userId: user.id, clerkUserId: user.clerkUserId, displayName });

    // The dashboard greeting reads the synchronized value as of this unit.
    revalidatePath("/settings/account");
    revalidatePath("/dashboard");

    return { ok: true, data: { displayName: updated.displayName } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That name isn't valid." } };
    }
    console.error("Unexpected update name action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}
