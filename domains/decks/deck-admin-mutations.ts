import type { DbClient } from "@/db/client";
import { recordAuditEvent } from "@/domains/admin/audit-repository";
import { DeckError } from "@/lib/errors/deck-errors";

import {
  deleteDeck,
  deleteDeckItem,
  filterPublishedLearningItemIds,
  getDeckItemIds,
  getDeckRecordForUpdate,
  insertDeck,
  insertDeckItems,
  updateDeckAvailability,
  updateDeckFields,
} from "./deck-repository";
import type { DeckRecord } from "./deck-repository";
import { applyReorder } from "./deck-mutations";
import {
  createPolyglotDeckSchema,
  deckIdSchema,
  deckItemSchema,
  deckItemsSchema,
  reorderDeckItemsSchema,
  updatePolyglotDeckSchema,
} from "./deck-schemas";
import type { DeckAvailability } from "./deck-types";

/**
 * Admin-authored Polyglot deck mutations (spec 14's "Admin"). Structurally
 * the mirror of `deck-mutations.ts`, with three deliberate differences:
 *
 * - Membership is gated on curriculum publication, not on any learner's
 *   progress — an official deck is authored ahead of the learners who will
 *   see it.
 * - Availability (`level` gating vs. `theme` filtering) is settable, and is
 *   the only thing that decides when a learner first sees the deck.
 * - Every change writes an admin audit event, in the same transaction as the
 *   mutation it records, matching how `domains/admin`'s curriculum
 *   mutations behave.
 *
 * Authentication, `canManageCurriculum`, and rate limiting happen in the
 * caller (`deck-service.ts`) — rate limiting is server-only-guarded and
 * cannot live in this `DbClient`-injectable module, the same constraint
 * every prior spec resolved the same way.
 */

const DECK_RESOURCE_TYPE = "deck";

function assertPolyglotDeck(deck: DeckRecord | null): DeckRecord {
  if (!deck) throw new DeckError("DECK_NOT_FOUND");
  // An admin manages official decks here; a learner's personal deck is never
  // administrable, even by an admin (spec 14 scopes Admin to Polyglot decks).
  if (deck.kind !== "polyglot") throw new DeckError("FORBIDDEN");
  return deck;
}

async function requirePublishedItems(db: DbClient, languageId: string, learningItemIds: string[]): Promise<void> {
  const published = await filterPublishedLearningItemIds(db, { languageId, learningItemIds });
  if (published.length !== learningItemIds.length) throw new DeckError("DECK_ITEM_NOT_ELIGIBLE");
}

export type CreatePolyglotDeckInput = {
  actorUserId: string;
  languageId: string;
  name: string;
  description: string | null;
  availability: DeckAvailability;
  gateLevelId: string | null;
  learningItemIds: string[];
};

export async function createPolyglotDeck(db: DbClient, input: CreatePolyglotDeckInput): Promise<{ deckId: string }> {
  const parsed = createPolyglotDeckSchema.parse(input);
  await requirePublishedItems(db, input.languageId, parsed.learningItemIds);

  return db.transaction(async (tx) => {
    const deckId = await insertDeck(tx, {
      languageId: input.languageId,
      kind: "polyglot",
      ownerUserId: null,
      name: parsed.name,
      description: parsed.description,
      availability: parsed.availability,
      gateLevelId: parsed.gateLevelId,
    });
    await insertDeckItems(tx, { deckId, languageId: input.languageId, learningItemIds: parsed.learningItemIds });
    await recordAuditEvent(tx, {
      actorUserId: input.actorUserId,
      action: "DECK_CREATED",
      resourceType: DECK_RESOURCE_TYPE,
      resourceId: deckId,
      afterData: {
        name: parsed.name,
        availability: parsed.availability,
        gateLevelId: parsed.gateLevelId,
        itemCount: parsed.learningItemIds.length,
      },
    });
    return { deckId };
  });
}

export type UpdatePolyglotDeckInput = {
  actorUserId: string;
  deckId: string;
  name: string;
  description: string | null;
  availability: DeckAvailability;
  gateLevelId: string | null;
};

export async function updatePolyglotDeck(db: DbClient, input: UpdatePolyglotDeckInput): Promise<void> {
  const parsed = updatePolyglotDeckSchema.parse(input);

  await db.transaction(async (tx) => {
    const deck = assertPolyglotDeck(await getDeckRecordForUpdate(tx, parsed.deckId));
    await updateDeckFields(tx, { deckId: parsed.deckId, name: parsed.name, description: parsed.description });
    await updateDeckAvailability(tx, {
      deckId: parsed.deckId,
      availability: parsed.availability,
      gateLevelId: parsed.gateLevelId,
    });
    await recordAuditEvent(tx, {
      actorUserId: input.actorUserId,
      action: "DECK_UPDATED",
      resourceType: DECK_RESOURCE_TYPE,
      resourceId: parsed.deckId,
      beforeData: { name: deck.name, availability: deck.availability, gateLevelId: deck.gateLevelId },
      afterData: { name: parsed.name, availability: parsed.availability, gateLevelId: parsed.gateLevelId },
    });
  });
}

export type AddPolyglotDeckItemsInput = {
  actorUserId: string;
  deckId: string;
  learningItemIds: string[];
};

export async function addPolyglotDeckItems(db: DbClient, input: AddPolyglotDeckItemsInput): Promise<{ addedCount: number }> {
  const parsed = deckItemsSchema.parse(input);

  return db.transaction(async (tx) => {
    const deck = assertPolyglotDeck(await getDeckRecordForUpdate(tx, parsed.deckId));
    await requirePublishedItems(tx, deck.languageId, parsed.learningItemIds);

    const existing = new Set(await getDeckItemIds(tx, parsed.deckId));
    const toAdd = parsed.learningItemIds.filter((id) => !existing.has(id));
    if (toAdd.length === 0) return { addedCount: 0 };

    await insertDeckItems(tx, { deckId: parsed.deckId, languageId: deck.languageId, learningItemIds: toAdd });
    await recordAuditEvent(tx, {
      actorUserId: input.actorUserId,
      action: "DECK_ITEMS_CHANGED",
      resourceType: DECK_RESOURCE_TYPE,
      resourceId: parsed.deckId,
      afterData: { added: toAdd.length },
    });
    return { addedCount: toAdd.length };
  });
}

export type RemovePolyglotDeckItemInput = {
  actorUserId: string;
  deckId: string;
  learningItemId: string;
};

export async function removePolyglotDeckItem(db: DbClient, input: RemovePolyglotDeckItemInput): Promise<void> {
  const parsed = deckItemSchema.parse(input);

  await db.transaction(async (tx) => {
    assertPolyglotDeck(await getDeckRecordForUpdate(tx, parsed.deckId));

    const currentIds = await getDeckItemIds(tx, parsed.deckId);
    if (!currentIds.includes(parsed.learningItemId)) throw new DeckError("DECK_ITEM_NOT_FOUND");
    if (currentIds.length === 1) throw new DeckError("DECK_MUST_HAVE_ITEMS");

    await deleteDeckItem(tx, { deckId: parsed.deckId, learningItemId: parsed.learningItemId });
    await recordAuditEvent(tx, {
      actorUserId: input.actorUserId,
      action: "DECK_ITEMS_CHANGED",
      resourceType: DECK_RESOURCE_TYPE,
      resourceId: parsed.deckId,
      beforeData: { removed: parsed.learningItemId },
    });
  });
}

export type ReorderPolyglotDeckItemsInput = {
  actorUserId: string;
  deckId: string;
  orderedLearningItemIds: string[];
};

export async function reorderPolyglotDeckItems(db: DbClient, input: ReorderPolyglotDeckItemsInput): Promise<void> {
  const parsed = reorderDeckItemsSchema.parse(input);

  await db.transaction(async (tx) => {
    assertPolyglotDeck(await getDeckRecordForUpdate(tx, parsed.deckId));
    await applyReorder(tx, parsed.deckId, parsed.orderedLearningItemIds);
    await recordAuditEvent(tx, {
      actorUserId: input.actorUserId,
      action: "DECK_ITEMS_REORDERED",
      resourceType: DECK_RESOURCE_TYPE,
      resourceId: parsed.deckId,
      afterData: { itemCount: parsed.orderedLearningItemIds.length },
    });
  });
}

export type DeletePolyglotDeckInput = { actorUserId: string; deckId: string };

export async function deletePolyglotDeck(db: DbClient, input: DeletePolyglotDeckInput): Promise<void> {
  const parsed = deckIdSchema.parse(input);

  await db.transaction(async (tx) => {
    const deck = assertPolyglotDeck(await getDeckRecordForUpdate(tx, parsed.deckId));
    await deleteDeck(tx, parsed.deckId);
    await recordAuditEvent(tx, {
      actorUserId: input.actorUserId,
      action: "DECK_DELETED",
      resourceType: DECK_RESOURCE_TYPE,
      resourceId: parsed.deckId,
      beforeData: { name: deck.name, availability: deck.availability },
    });
  });
}
