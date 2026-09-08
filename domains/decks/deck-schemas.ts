import { z } from "zod";

/**
 * Boundary validation for deck input (spec 14), shared by Server Actions and
 * the service layer so the server always revalidates even when the client
 * already did. Zod is the source of truth for these shapes; the mutation
 * input types are inferred from them rather than declared twice.
 */

export const DECK_NAME_MAX_LENGTH = 80;
export const DECK_DESCRIPTION_MAX_LENGTH = 280;
/** One page of the personal-deck item picker. Bounded so a long-running account can never request its whole learned history at once. */
export const DECK_ITEM_PICKER_LIMIT = 100;
/** Upper bound on a single add/create/reorder payload — generous for real use, still a hard ceiling on one request's write volume. */
export const DECK_ITEMS_MAX = 500;

/** Same permissive UUID-shape reasoning as `domains/curriculum/curriculum-mutation-schemas.ts` — this codebase's seeded fixture IDs don't satisfy `z.uuid()`'s stricter RFC 4122 version check. */
const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

export const deckNameSchema = z.string().trim().min(1).max(DECK_NAME_MAX_LENGTH);

/** An omitted, empty, or whitespace-only description is stored as NULL, never as "". */
export const deckDescriptionSchema = z
  .string()
  .trim()
  .max(DECK_DESCRIPTION_MAX_LENGTH)
  .transform((value) => (value.length === 0 ? null : value))
  .nullish()
  .transform((value) => value ?? null);

const learningItemIdSchema = uuidLike;

/** Deduplicates while preserving the caller's ordering — a repeated id is a client slip, not a reason to reject the whole request. */
const learningItemIdsSchema = z
  .array(learningItemIdSchema)
  .max(DECK_ITEMS_MAX)
  .transform((ids) => [...new Set(ids)]);

export const nonEmptyLearningItemIdsSchema = learningItemIdsSchema.refine((ids) => ids.length > 0, {
  message: "A deck needs at least one item.",
});

export const createPersonalDeckSchema = z.object({
  name: deckNameSchema,
  description: deckDescriptionSchema,
  learningItemIds: nonEmptyLearningItemIdsSchema,
});

export const updateDeckDetailsSchema = z.object({
  deckId: uuidLike,
  name: deckNameSchema,
  description: deckDescriptionSchema,
});

export const deckItemsSchema = z.object({
  deckId: uuidLike,
  learningItemIds: nonEmptyLearningItemIdsSchema,
});

export const deckItemSchema = z.object({
  deckId: uuidLike,
  learningItemId: learningItemIdSchema,
});

export const reorderDeckItemsSchema = z.object({
  deckId: uuidLike,
  orderedLearningItemIds: nonEmptyLearningItemIdsSchema,
});

export const deckIdSchema = z.object({ deckId: uuidLike });

/**
 * Polyglot deck shape (spec 14's "Polyglot Deck Availability"). A `level`
 * deck must name the level that reveals it; a `theme` deck must not, and the
 * database's `decks_shape_check` enforces the same pairing independently.
 */
export const polyglotDeckAvailabilitySchema = z.discriminatedUnion("availability", [
  z.object({ availability: z.literal("theme"), gateLevelId: z.null().default(null) }),
  z.object({ availability: z.literal("level"), gateLevelId: uuidLike }),
]);

export const createPolyglotDeckSchema = z.intersection(
  z.object({
    name: deckNameSchema,
    description: deckDescriptionSchema,
    learningItemIds: nonEmptyLearningItemIdsSchema,
  }),
  polyglotDeckAvailabilitySchema,
);

export const updatePolyglotDeckSchema = z.intersection(
  z.object({
    deckId: uuidLike,
    name: deckNameSchema,
    description: deckDescriptionSchema,
  }),
  polyglotDeckAvailabilitySchema,
);
