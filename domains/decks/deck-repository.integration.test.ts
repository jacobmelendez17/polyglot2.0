import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { deckItems, decks, userItemProgress, userLevelProgress } from "@/db/schema";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import type { TestTx } from "@/db/test/with-test-transaction";
import { DeckError } from "@/lib/errors/deck-errors";

import {
  addPersonalDeckItems,
  createPersonalDeck,
  deletePersonalDeck,
  removePersonalDeckItem,
  reorderPersonalDeckItems,
  updatePersonalDeckDetails,
} from "./deck-mutations";
import {
  addPolyglotDeckItems,
  createPolyglotDeck,
  removePolyglotDeckItem,
  updatePolyglotDeck,
} from "./deck-admin-mutations";
import {
  getDeckForLearner,
  getEligibleDeckItems,
  insertDeck,
  insertDeckItems,
  isDeckItemPracticable,
  listDecksForLearner,
} from "./deck-repository";
import { startDeckPractice } from "./deck-practice-session";

/**
 * Spec 14's real-database behavior: deck visibility, the "already learned"
 * eligibility rule, ownership, the non-empty invariant, and — the one that
 * matters most — that no deck operation ever touches SRS state.
 *
 * The seeded learner has Level 1 unlocked and progress on exactly one item
 * (`gato`, Beginner 2). `casa`, `agua`, and the grammar item `y` are
 * published Level 1 curriculum they have *not* learned; `rojo` is Level 2,
 * which they have not unlocked at all.
 */

const OTHER_USER_ID = "60000000-0000-0000-0000-000000000002"; // the seeded developer account

/** Gives the learner real SRS progress for an item, the only way an item becomes deck-eligible. */
async function learnItem(tx: TestTx, userId: string, languageId: string, learningItemId: string) {
  await tx
    .insert(userItemProgress)
    .values({ userId, learningItemId, languageId, srsStage: "beginner_1" })
    .onConflictDoNothing({ target: [userItemProgress.userId, userItemProgress.learningItemId] });
}

describe("deck eligibility (spec 14)", () => {
  it("offers only items the learner has already learned", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);

      const eligible = await getEligibleDeckItems(tx, { userId: learnerId, languageId, limit: 100 });

      expect(eligible.map((item) => item.learningItemId)).toEqual([gatoId]);
      expect(eligible[0].primary).toBe("el gato");
      expect(eligible[0].srsStage).toBe("beginner_2");
    });
  });

  it("exposes a newly learned item without any further deck change", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId } = await seedTestFixtures(tx);
      await learnItem(tx, learnerId, languageId, casaId);

      const eligible = await getEligibleDeckItems(tx, { userId: learnerId, languageId, limit: 100 });
      expect(eligible.map((item) => item.learningItemId)).toContain(casaId);
    });
  });

  it("rejects a personal deck built from an item the learner has not learned", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, casaId } = await seedTestFixtures(tx);

      await expect(
        createPersonalDeck(tx, {
          userId: learnerId,
          languageId,
          name: "Too soon",
          description: null,
          learningItemIds: [casaId],
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "DECK_ITEM_NOT_ELIGIBLE" });

      expect(await tx.select().from(decks).where(eq(decks.ownerUserId, learnerId))).toHaveLength(0);
    });
  });
});

describe("personal deck mutations (spec 14)", () => {
  it("creates a deck with its items in one transaction", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      await learnItem(tx, learnerId, languageId, casaId);

      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "  Kitchen  ",
        description: "   ",
        learningItemIds: [gatoId, casaId],
        idempotencyKey: crypto.randomUUID(),
      });

      const [deck] = await tx.select().from(decks).where(eq(decks.id, deckId));
      expect(deck.name).toBe("Kitchen");
      // A whitespace-only description is stored as NULL, never as "".
      expect(deck.description).toBeNull();
      expect(deck.kind).toBe("personal");
      expect(deck.ownerUserId).toBe(learnerId);

      const items = await tx.select().from(deckItems).where(eq(deckItems.deckId, deckId));
      expect(items.map((item) => item.position).sort()).toEqual([1, 2]);
    });
  });

  it("replays a repeated create with the same idempotency key instead of making a second deck", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const key = crypto.randomUUID();
      const input = {
        userId: learnerId,
        languageId,
        name: "Once",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: key,
      };

      const first = await createPersonalDeck(tx, input);
      const second = await createPersonalDeck(tx, input);

      expect(second.deckId).toBe(first.deckId);
      expect(await tx.select().from(decks).where(eq(decks.ownerUserId, learnerId))).toHaveLength(1);
    });
  });

  it("refuses to create an empty deck", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      await expect(
        createPersonalDeck(tx, {
          userId: learnerId,
          languageId,
          name: "Empty",
          description: null,
          learningItemIds: [],
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toBeDefined();
    });
  });

  it("refuses to remove the final item, so a deck can never reach zero", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Solo",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(removePersonalDeckItem(tx, { userId: learnerId, deckId, learningItemId: gatoId })).rejects.toMatchObject({
        code: "DECK_MUST_HAVE_ITEMS",
      });
      expect(await tx.select().from(deckItems).where(eq(deckItems.deckId, deckId))).toHaveLength(1);
    });
  });

  it("reorders items and rejects an ordering containing an item the deck does not hold", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId, aguaId } = await seedTestFixtures(tx);
      await learnItem(tx, learnerId, languageId, casaId);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Ordered",
        description: null,
        learningItemIds: [gatoId, casaId],
        idempotencyKey: crypto.randomUUID(),
      });

      await reorderPersonalDeckItems(tx, { userId: learnerId, deckId, orderedLearningItemIds: [casaId, gatoId] });

      const deck = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      expect(deck?.items.map((item) => item.learningItemId)).toEqual([casaId, gatoId]);

      // An id that is not in this deck is a stale or malformed request.
      await expect(
        reorderPersonalDeckItems(tx, { userId: learnerId, deckId, orderedLearningItemIds: [casaId, aguaId] }),
      ).rejects.toMatchObject({ code: "DECK_VALIDATION_FAILED" });

      // A repeated id is collapsed by the input schema rather than rejected —
      // the same "a duplicate is a client slip, not a reason to fail the
      // request" rule the create/add paths follow. Ordering by the deduplicated
      // list leaves the deck's other item after it, unmoved.
      await reorderPersonalDeckItems(tx, { userId: learnerId, deckId, orderedLearningItemIds: [gatoId, gatoId] });
      const afterDuplicate = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      expect(afterDuplicate?.items.map((item) => item.learningItemId)).toEqual([gatoId, casaId]);
    });
  });

  it("stays reorderable when the deck holds an item the learner can no longer see", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      await learnItem(tx, learnerId, languageId, casaId);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Partly hidden",
        description: null,
        learningItemIds: [gatoId, casaId],
        idempotencyKey: crypto.randomUUID(),
      });

      // An account progress reset removes the underlying progress row, so
      // `casa` drops out of the learner's view while staying in the deck.
      await tx.delete(userItemProgress).where(eq(userItemProgress.learningItemId, casaId));

      const visible = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      expect(visible?.items.map((item) => item.learningItemId)).toEqual([gatoId]);

      // Reordering what they *can* see must still work rather than failing
      // validation against the deck's full, partly invisible membership.
      await reorderPersonalDeckItems(tx, { userId: learnerId, deckId, orderedLearningItemIds: [gatoId] });

      const positions = await tx.select().from(deckItems).where(eq(deckItems.deckId, deckId));
      expect(positions).toHaveLength(2);
      expect(positions.every((row) => row.position > 0)).toBe(true);
    });
  });

  it("ignores an item the deck already holds rather than failing the whole add", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      await learnItem(tx, learnerId, languageId, casaId);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Dedupe",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: crypto.randomUUID(),
      });

      const result = await addPersonalDeckItems(tx, {
        userId: learnerId,
        languageId,
        deckId,
        learningItemIds: [gatoId, casaId],
      });

      expect(result.addedCount).toBe(1);
      expect(await tx.select().from(deckItems).where(eq(deckItems.deckId, deckId))).toHaveLength(2);
    });
  });

  it("deletes a deck and its membership without touching the curriculum items or SRS progress", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const before = await tx.select().from(userItemProgress).where(eq(userItemProgress.learningItemId, gatoId));
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Temporary",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: crypto.randomUUID(),
      });

      await deletePersonalDeck(tx, { userId: learnerId, deckId });

      expect(await tx.select().from(decks).where(eq(decks.id, deckId))).toHaveLength(0);
      expect(await tx.select().from(deckItems).where(eq(deckItems.deckId, deckId))).toHaveLength(0);
      expect(await tx.select().from(userItemProgress).where(eq(userItemProgress.learningItemId, gatoId))).toEqual(before);
    });
  });
});

describe("deck ownership and Polyglot immutability (spec 14)", () => {
  it("refuses every personal-deck mutation from a user who does not own the deck", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Mine",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updatePersonalDeckDetails(tx, { userId: OTHER_USER_ID, deckId, name: "Theirs", description: null }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(deletePersonalDeck(tx, { userId: OTHER_USER_ID, deckId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        reorderPersonalDeckItems(tx, { userId: OTHER_USER_ID, deckId, orderedLearningItemIds: [gatoId] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("refuses a learner's attempt to modify a Polyglot deck", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const deckId = await insertDeck(tx, {
        languageId,
        kind: "polyglot",
        ownerUserId: null,
        name: "Official",
        description: null,
        availability: "theme",
        gateLevelId: null,
      });
      await insertDeckItems(tx, { deckId, languageId, learningItemIds: [gatoId] });

      await expect(
        updatePersonalDeckDetails(tx, { userId: learnerId, deckId, name: "Hacked", description: null }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(deletePersonalDeck(tx, { userId: learnerId, deckId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        removePersonalDeckItem(tx, { userId: learnerId, deckId, learningItemId: gatoId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const detail = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      expect(detail?.canManage).toBe(false);
    });
  });

  it("refuses an admin deck mutation aimed at a learner's personal deck", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, gatoId } = await seedTestFixtures(tx);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Private",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updatePolyglotDeck(tx, {
          actorUserId: developerId,
          deckId,
          name: "Seized",
          description: null,
          availability: "theme",
          gateLevelId: null,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});

describe("Polyglot deck availability (spec 14)", () => {
  it("hides a Level deck until its Level is unlocked, then shows every configured item", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, level2Id, rojoId } = await seedTestFixtures(tx);
      const { deckId } = await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Level 2 essentials",
        description: null,
        availability: "level",
        gateLevelId: level2Id,
        learningItemIds: [rojoId],
      });

      // Level 2 is not unlocked for this learner yet.
      expect((await listDecksForLearner(tx, { userId: learnerId, languageId })).map((deck) => deck.id)).not.toContain(deckId);
      expect(await getDeckForLearner(tx, { userId: learnerId, languageId, deckId })).toBeNull();

      await tx.insert(userLevelProgress).values({ userId: learnerId, levelId: level2Id, unlockedAt: new Date() });

      const detail = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      // `rojo` has no SRS progress, yet a Level deck still exposes it once available.
      expect(detail?.items.map((item) => item.learningItemId)).toEqual([rojoId]);
      expect(detail?.items[0].srsStage).toBeNull();
    });
  });

  it("shows a Theme deck immediately but only the items the learner has reached", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      const { deckId } = await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Household",
        description: null,
        availability: "theme",
        gateLevelId: null,
        learningItemIds: [gatoId, casaId],
      });

      const before = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      expect(before?.items.map((item) => item.learningItemId)).toEqual([gatoId]);
      // The card still advertises the deck's real content type, from every configured item.
      expect(before?.contentType).toBe("vocabulary");

      await learnItem(tx, learnerId, languageId, casaId);

      const after = await getDeckForLearner(tx, { userId: learnerId, languageId, deckId });
      expect(after?.items.map((item) => item.learningItemId)).toEqual([gatoId, casaId]);
    });
  });

  it("counts only practicable items on the deck card", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, gatoId, casaId, grammarYId } = await seedTestFixtures(tx);
      await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Mixed",
        description: null,
        availability: "theme",
        gateLevelId: null,
        learningItemIds: [gatoId, casaId, grammarYId],
      });

      const summary = (await listDecksForLearner(tx, { userId: learnerId, languageId })).find(
        (deck) => deck.name === "Mixed",
      );
      expect(summary?.itemCount).toBe(1);
      // Vocabulary and grammar coexist in the configured deck, so it reads as "both".
      expect(summary?.contentType).toBe("both");
    });
  });

  it("keeps official decks non-empty too", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId, languageId, gatoId } = await seedTestFixtures(tx);
      const { deckId } = await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Official solo",
        description: null,
        availability: "theme",
        gateLevelId: null,
        learningItemIds: [gatoId],
      });

      await expect(
        removePolyglotDeckItem(tx, { actorUserId: developerId, deckId, learningItemId: gatoId }),
      ).rejects.toMatchObject({ code: "DECK_MUST_HAVE_ITEMS" });
    });
  });

  it("lets an official deck reference published curriculum no learner has reached", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId, languageId, gatoId, rojoId } = await seedTestFixtures(tx);
      const { deckId } = await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Ahead of the learner",
        description: null,
        availability: "theme",
        gateLevelId: null,
        learningItemIds: [gatoId],
      });

      const result = await addPolyglotDeckItems(tx, { actorUserId: developerId, deckId, learningItemIds: [rojoId] });
      expect(result.addedCount).toBe(1);
    });
  });
});

describe("deck practice never mutates learning state (spec 14)", () => {
  it("builds a session from the deck without changing any progress row", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const { deckId } = await createPersonalDeck(tx, {
        userId: learnerId,
        languageId,
        name: "Practice me",
        description: null,
        learningItemIds: [gatoId],
        idempotencyKey: crypto.randomUUID(),
      });
      const before = await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, learnerId));

      const session = await startDeckPractice(tx, { userId: learnerId, languageId, deckId });

      expect(session.itemCount).toBe(1);
      // Vocabulary is practiced in both directions, exactly as a review would.
      expect(session.questions).toHaveLength(2);
      expect(await tx.select().from(userItemProgress).where(eq(userItemProgress.userId, learnerId))).toEqual(before);
    });
  });

  it("refuses to practice an item that is not practicable in this deck for this learner", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      const { deckId } = await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Partly reachable",
        description: null,
        availability: "theme",
        gateLevelId: null,
        learningItemIds: [gatoId, casaId],
      });

      expect(await isDeckItemPracticable(tx, { userId: learnerId, languageId, deckId, learningItemId: gatoId })).toBe(true);
      // `casa` is in the deck but the learner has not learned it, so it is not theirs to practice yet.
      expect(await isDeckItemPracticable(tx, { userId: learnerId, languageId, deckId, learningItemId: casaId })).toBe(false);
    });
  });

  it("refuses to start practice on a deck the learner cannot see", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, level2Id, rojoId } = await seedTestFixtures(tx);
      const { deckId } = await createPolyglotDeck(tx, {
        actorUserId: developerId,
        languageId,
        name: "Locked away",
        description: null,
        availability: "level",
        gateLevelId: level2Id,
        learningItemIds: [rojoId],
      });

      await expect(startDeckPractice(tx, { userId: learnerId, languageId, deckId })).rejects.toBeInstanceOf(DeckError);
    });
  });
});
