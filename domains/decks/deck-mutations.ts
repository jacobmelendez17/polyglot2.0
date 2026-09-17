import type { DbClient } from "@/db/client";
import { withIdempotency } from "@/domains/idempotency";
import { DeckError } from "@/lib/errors/deck-errors";

import {
  deleteDeck,
  deleteDeckItem,
  filterEligibleLearningItemIds,
  getDeckItemIds,
  getDeckRecord,
  getDeckRecordForUpdate,
  insertDeck,
  insertDeckItems,
  reorderDeckItems,
  updateDeckFields,
} from "./deck-repository";
import type { DeckRecord } from "./deck-repository";
import {
  createPersonalDeckSchema,
  deckIdSchema,
  deckItemSchema,
  deckItemsSchema,
  reorderDeckItemsSchema,
  updateDeckDetailsSchema,
} from "./deck-schemas";

/**
 * Personal-deck mutations (spec 14's "Personal Deck Creation" and the
 * personal-deck half of "Deck Detail"). Takes an injected `DbClient` so the
 * ownership, eligibility, and non-empty rules below are integration-testable
 * inside a rolled-back transaction; `deck-service.ts` binds the real
 * database and the rate limiter.
 *
 * Three rules are enforced here and nowhere else:
 *
 * 1. **Ownership.** Only the owner of a personal deck may change it. A
 *    Polyglot deck is rejected outright, so a learner cannot rename,
 *    reorder, or empty official content — hiding the buttons is not
 *    authorization.
 * 2. **Eligibility.** Client-supplied learning-item ids are requests, never
 *    proof. Every id is re-checked against what the learner has actually
 *    learned before it is written.
 * 3. **Non-empty.** A deck may never be created empty, nor have its last
 *    item removed (spec 14: "A deck cannot exist with zero items").
 *
 * Any mutation whose decision depends on the deck's current contents reads
 * the deck row `FOR UPDATE` first, so two concurrent requests against one
 * deck serialize rather than both passing a check that only one of them
 * should. None of this touches SRS state, review scheduling, or curriculum
 * unlocks: deck membership is a reference to a canonical `learning_items`
 * row and nothing more.
 */

/**
 * Resolves a deck and proves the caller owns it. A Polyglot deck and someone
 * else's personal deck are both simply "not yours" — the distinction is not
 * useful to the caller and not worth leaking through separate messages.
 */
function assertOwnedPersonalDeck(
  deck: DeckRecord | null,
  userId: string,
): DeckRecord {
  if (!deck) throw new DeckError("DECK_NOT_FOUND");
  if (deck.kind !== "personal" || deck.ownerUserId !== userId)
    throw new DeckError("FORBIDDEN");
  return deck;
}

async function requireEligibleItems(
  db: DbClient,
  {
    userId,
    languageId,
    learningItemIds,
  }: { userId: string; languageId: string; learningItemIds: string[] },
): Promise<void> {
  const eligible = await filterEligibleLearningItemIds(db, {
    userId,
    languageId,
    learningItemIds,
  });
  if (eligible.length !== learningItemIds.length)
    throw new DeckError("DECK_ITEM_NOT_ELIGIBLE");
}

export type CreatePersonalDeckInput = {
  userId: string;
  languageId: string;
  name: string;
  description: string | null;
  learningItemIds: string[];
  /** Client-generated UUID, so a retried submit returns the first deck rather than creating a second one. */
  idempotencyKey: string;
};

export async function createPersonalDeck(
  db: DbClient,
  input: CreatePersonalDeckInput,
): Promise<{ deckId: string }> {
  const parsed = createPersonalDeckSchema.parse(input);
  await requireEligibleItems(db, {
    userId: input.userId,
    languageId: input.languageId,
    learningItemIds: parsed.learningItemIds,
  });

  // The deck row and its items commit together — `withIdempotency` opens the
  // transaction, so a failure partway through leaves no empty deck behind.
  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "deck.create",
      key: input.idempotencyKey,
      payload: {
        name: parsed.name,
        description: parsed.description,
        learningItemIds: parsed.learningItemIds,
      },
    },
    async (tx) => {
      const deckId = await insertDeck(tx, {
        languageId: input.languageId,
        kind: "personal",
        ownerUserId: input.userId,
        name: parsed.name,
        description: parsed.description,
        availability: "theme",
        gateLevelId: null,
      });
      await insertDeckItems(tx, {
        deckId,
        languageId: input.languageId,
        learningItemIds: parsed.learningItemIds,
      });
      return { deckId };
    },
  );
}

export type UpdatePersonalDeckDetailsInput = {
  userId: string;
  deckId: string;
  name: string;
  description: string | null;
};

/** Renaming touches nothing that depends on the deck's contents, so it needs no lock. */
export async function updatePersonalDeckDetails(
  db: DbClient,
  input: UpdatePersonalDeckDetailsInput,
): Promise<void> {
  const parsed = updateDeckDetailsSchema.parse(input);
  assertOwnedPersonalDeck(await getDeckRecord(db, parsed.deckId), input.userId);
  await updateDeckFields(db, {
    deckId: parsed.deckId,
    name: parsed.name,
    description: parsed.description,
  });
}

export type AddPersonalDeckItemsInput = {
  userId: string;
  languageId: string;
  deckId: string;
  learningItemIds: string[];
};

export async function addPersonalDeckItems(
  db: DbClient,
  input: AddPersonalDeckItemsInput,
): Promise<{ addedCount: number }> {
  const parsed = deckItemsSchema.parse(input);

  return db.transaction(async (tx) => {
    const deck = assertOwnedPersonalDeck(
      await getDeckRecordForUpdate(tx, parsed.deckId),
      input.userId,
    );
    await requireEligibleItems(tx, {
      userId: input.userId,
      languageId: deck.languageId,
      learningItemIds: parsed.learningItemIds,
    });

    // Adding an item the deck already holds is a no-op, not an error — two
    // browser tabs picking overlapping selections is ordinary, and the
    // `(deck_id, learning_item_id)` unique constraint would otherwise fail
    // the whole request over it.
    const existing = new Set(await getDeckItemIds(tx, parsed.deckId));
    const toAdd = parsed.learningItemIds.filter((id) => !existing.has(id));
    await insertDeckItems(tx, {
      deckId: parsed.deckId,
      languageId: deck.languageId,
      learningItemIds: toAdd,
    });
    return { addedCount: toAdd.length };
  });
}

export type RemovePersonalDeckItemInput = {
  userId: string;
  deckId: string;
  learningItemId: string;
};

export async function removePersonalDeckItem(
  db: DbClient,
  input: RemovePersonalDeckItemInput,
): Promise<void> {
  const parsed = deckItemSchema.parse(input);

  await db.transaction(async (tx) => {
    assertOwnedPersonalDeck(
      await getDeckRecordForUpdate(tx, parsed.deckId),
      input.userId,
    );

    const currentIds = await getDeckItemIds(tx, parsed.deckId);
    if (!currentIds.includes(parsed.learningItemId))
      throw new DeckError("DECK_ITEM_NOT_FOUND");
    // Spec 14: removing the final item would leave a deck that cannot exist.
    // Deleting the deck instead is a different, deliberate action.
    if (currentIds.length === 1) throw new DeckError("DECK_MUST_HAVE_ITEMS");

    await deleteDeckItem(tx, {
      deckId: parsed.deckId,
      learningItemId: parsed.learningItemId,
    });
  });
}

export type ReorderPersonalDeckItemsInput = {
  userId: string;
  deckId: string;
  orderedLearningItemIds: string[];
};

export async function reorderPersonalDeckItems(
  db: DbClient,
  input: ReorderPersonalDeckItemsInput,
): Promise<void> {
  const parsed = reorderDeckItemsSchema.parse(input);

  await db.transaction(async (tx) => {
    assertOwnedPersonalDeck(
      await getDeckRecordForUpdate(tx, parsed.deckId),
      input.userId,
    );
    await applyReorder(tx, parsed.deckId, parsed.orderedLearningItemIds);
  });
}

/**
 * Rewrites deck order. Must be called inside a transaction that already holds
 * the deck row lock, because it reads the deck's current membership to decide
 * what to write, and the two-phase position rewrite must not be observable
 * half-applied.
 *
 * Every supplied id must belong to the deck — an ordering naming something
 * the deck does not hold is a stale or malformed request, not a reorder.
 * (Repeats never reach here through a Server Action: `reorderDeckItemsSchema`
 * deduplicates first, on the same "a duplicate is a client slip" rule the
 * create and add paths use. The check below still guards a direct domain
 * caller.) The ordering need not, however, cover the *whole* deck. What a learner sees on
 * the deck page is only the items they have learned, and a deck can hold rows
 * that are not currently visible to them: an item archived out of the
 * curriculum, or one whose progress a reset removed. Rejecting a partial
 * ordering would make such a deck permanently un-reorderable, so anything the
 * caller left out keeps its existing relative order and follows the supplied
 * items. In the ordinary case — every item visible — this is exactly a
 * permutation rewrite.
 */
export async function applyReorder(
  tx: DbClient,
  deckId: string,
  orderedLearningItemIds: string[],
): Promise<void> {
  const currentIds = await getDeckItemIds(tx, deckId);
  const current = new Set(currentIds);
  const supplied = new Set(orderedLearningItemIds);

  const isValidSelection =
    supplied.size === orderedLearningItemIds.length &&
    orderedLearningItemIds.every((id) => current.has(id));
  if (!isValidSelection) throw new DeckError("DECK_VALIDATION_FAILED");

  const remaining = currentIds.filter((id) => !supplied.has(id));
  await reorderDeckItems(tx, deckId, [...orderedLearningItemIds, ...remaining]);
}

export type DeletePersonalDeckInput = { userId: string; deckId: string };

export async function deletePersonalDeck(
  db: DbClient,
  input: DeletePersonalDeckInput,
): Promise<void> {
  const parsed = deckIdSchema.parse(input);
  assertOwnedPersonalDeck(await getDeckRecord(db, parsed.deckId), input.userId);
  // `deck_items` cascades from the deck row's composite foreign key, so this
  // needs no explicit child delete.
  await deleteDeck(db, parsed.deckId);
}
