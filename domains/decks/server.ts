/**
 * Server-only entry point for `domains/decks` (spec 14). `./deck-service.ts`
 * transitively imports `db/client.ts` — import from here only in server-only
 * files, never a `"use client"` component. `./index.ts` stays safe for a
 * client component to value-import (types plus pure view/practice helpers).
 * Same split, for the same reason, as `domains/srs/server.ts` and
 * `domains/progress/server.ts`.
 */
export {
  addPersonalDeckItems,
  addPolyglotDeckItems,
  createPersonalDeck,
  createPolyglotDeck,
  deletePersonalDeck,
  deletePolyglotDeck,
  getDeck,
  getPolyglotDeck,
  getPolyglotDeckItems,
  gradeDeckPracticeAnswer,
  listDecks,
  listEligibleDeckItems,
  listPolyglotDecks,
  listPublishedItemsForAdmin,
  removePersonalDeckItem,
  removePolyglotDeckItem,
  reorderPersonalDeckItems,
  reorderPolyglotDeckItems,
  startDeckPractice,
  updatePersonalDeckDetails,
  updatePolyglotDeck,
} from "./deck-service";
export type { DeckPracticeSession } from "./deck-practice-session";
