"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canPublishCurriculum } from "@/domains/admin";
import {
  addPolyglotDeckItems,
  createPolyglotDeck,
  deletePolyglotDeck,
  listPublishedItemsForAdmin,
  removePolyglotDeckItem,
  reorderPolyglotDeckItems,
  updatePolyglotDeck,
} from "@/domains/decks/server";
import type { DeckPickerItem } from "@/domains/decks";
import {
  createPolyglotDeckSchema,
  deckIdSchema,
  deckItemSchema,
  deckItemsSchema,
  reorderDeckItemsSchema,
  updatePolyglotDeckSchema,
} from "@/domains/decks/deck-schemas";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { DeckError } from "@/lib/errors/deck-errors";

/**
 * Thin Server Action entry points for admin-authored Polyglot decks (spec
 * 14's "Admin"). Every action re-authenticates and re-checks
 * `canPublishCurriculum` server-side — never trusting hidden navigation or a
 * disabled button — and every deck rule stays in `domains/decks`. Mirrors
 * `app/(admin)/admin/curriculum/actions.ts`'s shape.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function runAdminDeckAction<T>(fn: (actorUserId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canPublishCurriculum(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof DeckError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "DECK_VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected admin deck action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const createDeckActionSchema = z.intersection(z.object({ languageId: z.string().min(1) }), createPolyglotDeckSchema);

export async function createPolyglotDeckAction(
  input: z.input<typeof createDeckActionSchema>,
): Promise<ActionResult<{ deckId: string }>> {
  return runAdminDeckAction(async (actorUserId) => {
    const parsed = createDeckActionSchema.parse(input);
    const result = await createPolyglotDeck({ ...parsed, actorUserId });
    revalidatePath("/admin/decks");
    return result;
  });
}

export async function updatePolyglotDeckAction(
  input: z.input<typeof updatePolyglotDeckSchema>,
): Promise<ActionResult<null>> {
  return runAdminDeckAction(async (actorUserId) => {
    const parsed = updatePolyglotDeckSchema.parse(input);
    await updatePolyglotDeck({ ...parsed, actorUserId });
    revalidatePath("/admin/decks");
    revalidatePath(`/admin/decks/${parsed.deckId}`);
    return null;
  });
}

export async function addPolyglotDeckItemsAction(
  input: z.input<typeof deckItemsSchema>,
): Promise<ActionResult<{ addedCount: number }>> {
  return runAdminDeckAction(async (actorUserId) => {
    const parsed = deckItemsSchema.parse(input);
    const result = await addPolyglotDeckItems({ ...parsed, actorUserId });
    revalidatePath(`/admin/decks/${parsed.deckId}`);
    return result;
  });
}

export async function removePolyglotDeckItemAction(
  input: z.input<typeof deckItemSchema>,
): Promise<ActionResult<null>> {
  return runAdminDeckAction(async (actorUserId) => {
    const parsed = deckItemSchema.parse(input);
    await removePolyglotDeckItem({ ...parsed, actorUserId });
    revalidatePath(`/admin/decks/${parsed.deckId}`);
    return null;
  });
}

export async function reorderPolyglotDeckItemsAction(
  input: z.input<typeof reorderDeckItemsSchema>,
): Promise<ActionResult<null>> {
  return runAdminDeckAction(async (actorUserId) => {
    const parsed = reorderDeckItemsSchema.parse(input);
    await reorderPolyglotDeckItems({ ...parsed, actorUserId });
    revalidatePath(`/admin/decks/${parsed.deckId}`);
    return null;
  });
}

export async function deletePolyglotDeckAction(input: z.input<typeof deckIdSchema>): Promise<ActionResult<null>> {
  return runAdminDeckAction(async (actorUserId) => {
    const parsed = deckIdSchema.parse(input);
    await deletePolyglotDeck({ ...parsed, actorUserId });
    revalidatePath("/admin/decks");
    return null;
  });
}

const searchItemsActionSchema = z.object({ languageId: z.string().min(1), search: z.string().max(120).optional() });

/** Powers the Admin deck-item picker — published curriculum, never gated on any learner's progress. */
export async function searchPublishedItemsAction(
  input: z.infer<typeof searchItemsActionSchema>,
): Promise<ActionResult<DeckPickerItem[]>> {
  return runAdminDeckAction(async () => {
    const parsed = searchItemsActionSchema.parse(input);
    return listPublishedItemsForAdmin(parsed);
  });
}
