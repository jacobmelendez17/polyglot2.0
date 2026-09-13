"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, updateName, updateUsername } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * Spec 20 Account. Every action here follows the same narrow-mutation
 * Server Action shape as `setCurriculumPreferenceAction`: the payload
 * carries only the new value, the authenticated user is resolved
 * server-side, and every expected failure returns a structured
 * `{ ok: false, error }` rather than throwing past the client boundary.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const nameInputSchema = z.object({
  displayName: z.string().trim().min(1, "Name can't be empty.").max(80, "That name is too long."),
});

// Recommended shape from spec 20 Account — Username, mirrored by the
// database's `users_username_format` check constraint as a second,
// independent layer (code-standards.md: "application validation and
// database constraints should complement each other").
const usernameInputSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,30}$/, "Usernames are 3-30 characters: letters, numbers, and underscores only."),
});

export async function updateNameAction(
  input: z.infer<typeof nameInputSchema>,
): Promise<ActionResult<{ displayName: string | null }>> {
  try {
    const { displayName } = nameInputSchema.parse(input);
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

export async function updateUsernameAction(
  input: z.infer<typeof usernameInputSchema>,
): Promise<ActionResult<{ username: string | null }>> {
  try {
    const { username } = usernameInputSchema.parse(input);
    const user = await requireUser();

    // Stored with the learner's chosen casing — only the *comparison* is
    // case-insensitive (spec 20: "JacobM"/"jacobm"/"JACOBM" conflict as
    // candidates, which `users_username_lower_key` decides at write time,
    // not something this action pre-normalizes away).
    const updated = await updateUsername({ userId: user.id, username });

    revalidatePath("/settings/account");

    return { ok: true, data: { username: updated.username } };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: error.issues[0]?.message ?? "That username isn't valid." } };
    }
    console.error("Unexpected update username action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Could not save setting. Please try again." } };
  }
}
