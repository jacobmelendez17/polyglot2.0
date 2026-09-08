"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addPersonalDeckItems,
  createPersonalDeck,
  deletePersonalDeck,
  listEligibleDeckItems,
  removePersonalDeckItem,
  reorderPersonalDeckItems,
  updatePersonalDeckDetails,
} from "@/domains/decks/server";
import type { DeckPickerItem } from "@/domains/decks";
import {
  createPersonalDeckSchema,
  deckIdSchema,
  deckItemSchema,
  deckItemsSchema,
  reorderDeckItemsSchema,
  updateDeckDetailsSchema,
} from "@/domains/decks/deck-schemas";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { DeckError } from "@/lib/errors/deck-errors";

/**
 * Thin Server Action entry points for learner-owned decks (spec 14). Every
 * payload is validated with Zod, every action re-authenticates and
 * re-resolves the active language server-side — a client-supplied `userId`
 * or `languageId` is never accepted — and all ownership, eligibility, and
 * non-empty rules stay in `domains/decks`. Mirrors
 * `app/(focus)/reviews/actions.ts`'s `ActionResult` shape.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function runDeckAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
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
    // Never log deck contents or the learner's private notes/synonyms.
    console.error("Unexpected deck action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const createDeckActionSchema = createPersonalDeckSchema.extend({ idempotencyKey: z.string().min(1) });

export async function createDeckAction(
  input: z.input<typeof createDeckActionSchema>,
): Promise<ActionResult<{ deckId: string }>> {
  return runDeckAction(async () => {
    const parsed = createDeckActionSchema.parse(input);
    const user = await requireUser();
    const result = await createPersonalDeck({
      userId: user.id,
      languageId: user.activeLanguageId,
      name: parsed.name,
      description: parsed.description,
      learningItemIds: parsed.learningItemIds,
      idempotencyKey: parsed.idempotencyKey,
    });
    revalidatePath("/decks");
    return result;
  });
}

export async function updateDeckDetailsAction(
  input: z.input<typeof updateDeckDetailsSchema>,
): Promise<ActionResult<null>> {
  return runDeckAction(async () => {
    const parsed = updateDeckDetailsSchema.parse(input);
    const user = await requireUser();
    await updatePersonalDeckDetails({
      userId: user.id,
      deckId: parsed.deckId,
      name: parsed.name,
      description: parsed.description,
    });
    revalidatePath(`/decks/${parsed.deckId}`);
    revalidatePath("/decks");
    return null;
  });
}

export async function addDeckItemsAction(
  input: z.input<typeof deckItemsSchema>,
): Promise<ActionResult<{ addedCount: number }>> {
  return runDeckAction(async () => {
    const parsed = deckItemsSchema.parse(input);
    const user = await requireUser();
    const result = await addPersonalDeckItems({
      userId: user.id,
      languageId: user.activeLanguageId,
      deckId: parsed.deckId,
      learningItemIds: parsed.learningItemIds,
    });
    revalidatePath(`/decks/${parsed.deckId}`);
    revalidatePath("/decks");
    return result;
  });
}

export async function removeDeckItemAction(input: z.input<typeof deckItemSchema>): Promise<ActionResult<null>> {
  return runDeckAction(async () => {
    const parsed = deckItemSchema.parse(input);
    const user = await requireUser();
    await removePersonalDeckItem({ userId: user.id, deckId: parsed.deckId, learningItemId: parsed.learningItemId });
    revalidatePath(`/decks/${parsed.deckId}`);
    revalidatePath("/decks");
    return null;
  });
}

export async function reorderDeckItemsAction(
  input: z.input<typeof reorderDeckItemsSchema>,
): Promise<ActionResult<null>> {
  return runDeckAction(async () => {
    const parsed = reorderDeckItemsSchema.parse(input);
    const user = await requireUser();
    await reorderPersonalDeckItems({
      userId: user.id,
      deckId: parsed.deckId,
      orderedLearningItemIds: parsed.orderedLearningItemIds,
    });
    revalidatePath(`/decks/${parsed.deckId}`);
    return null;
  });
}

export async function deleteDeckAction(input: z.input<typeof deckIdSchema>): Promise<ActionResult<null>> {
  return runDeckAction(async () => {
    const parsed = deckIdSchema.parse(input);
    const user = await requireUser();
    await deletePersonalDeck({ userId: user.id, deckId: parsed.deckId });
    revalidatePath("/decks");
    return null;
  });
}

const searchItemsActionSchema = z.object({ search: z.string().max(120).optional() });

/** Powers the "add items" picker. Read-only, and scoped server-side to what this learner has actually learned. */
export async function searchEligibleDeckItemsAction(
  input: z.infer<typeof searchItemsActionSchema>,
): Promise<ActionResult<DeckPickerItem[]>> {
  return runDeckAction(async () => {
    const parsed = searchItemsActionSchema.parse(input);
    const user = await requireUser();
    return listEligibleDeckItems({ userId: user.id, languageId: user.activeLanguageId, search: parsed.search });
  });
}
