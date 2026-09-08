/**
 * Client-safe public surface for `domains/decks` (spec 14): types and pure,
 * database-free calculations only. Every function that reads or writes the
 * database lives in `./server.ts` instead — see that file for why. A client
 * component may value-import from here safely; adding anything that reaches
 * `db/client.ts` to this barrel would bundle the database client into the
 * browser, the bug already found once in `domains/lessons`.
 */
export type {
  DeckAvailability,
  DeckContentFilter,
  DeckContentType,
  DeckDetail,
  DeckItemRow,
  DeckItemType,
  DeckKind,
  DeckPickerItem,
  DeckPracticeFeedback,
  DeckPracticeQuestion,
  DeckPracticeVerdict,
  DeckSummary,
} from "./deck-types";

export {
  DECK_ACCENT_CLASSES,
  DECK_CONTENT_FILTERS,
  DECK_CONTENT_TYPE_LABELS,
  deriveDeckContentType,
  filterDecks,
  matchesDeckContentFilter,
  matchesDeckSearch,
  parseDeckContentFilter,
} from "./deck-view";

export { deckItemLabel, summarizeDeckPractice } from "./deck-practice";
export type { DeckPracticeClassification, DeckPracticeSummary } from "./deck-practice";

export {
  DECK_DESCRIPTION_MAX_LENGTH,
  DECK_ITEM_PICKER_LIMIT,
  DECK_ITEMS_MAX,
  DECK_NAME_MAX_LENGTH,
} from "./deck-schemas";
