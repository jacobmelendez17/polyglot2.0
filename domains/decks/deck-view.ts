import type {
  DeckContentFilter,
  DeckContentType,
  DeckItemType,
  DeckSummary,
} from "./deck-types";

/**
 * Pure, database-free `/decks` presentation rules (spec 14). No React and no
 * Drizzle here, so search, filtering, and content-type derivation are
 * unit-testable on their own and are calculated in exactly one place rather
 * than being re-derived by each component.
 */

/**
 * What a deck contains, from its configured item counts. `null` means the
 * deck has no visible curriculum items at all — only reachable when every
 * item it references has been archived out of the curriculum, since spec 14
 * forbids creating or emptying a deck to zero items.
 */
export function deriveDeckContentType(
  counts: Record<DeckItemType, number>,
): DeckContentType | null {
  const hasVocabulary = counts.vocabulary > 0;
  const hasGrammar = counts.grammar > 0;
  if (hasVocabulary && hasGrammar) return "both";
  if (hasVocabulary) return "vocabulary";
  if (hasGrammar) return "grammar";
  return null;
}

export const DECK_CONTENT_FILTERS: readonly {
  value: DeckContentFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "vocabulary", label: "Vocabulary" },
  { value: "grammar", label: "Grammar" },
  { value: "both", label: "Both" },
] as const;

const CONTENT_FILTER_VALUES = new Set<string>(
  DECK_CONTENT_FILTERS.map((option) => option.value),
);

/** Narrows an untrusted `?type=` search param; anything unrecognized falls back to the unfiltered default. */
export function parseDeckContentFilter(
  raw: string | undefined,
): DeckContentFilter {
  return raw !== undefined && CONTENT_FILTER_VALUES.has(raw)
    ? (raw as DeckContentFilter)
    : "all";
}

/**
 * Case- and accent-insensitive substring match over deck name and
 * description. Diacritics are folded *here* — unlike answer checking, where
 * `sí` and `si` must stay distinct — because this is a search box over
 * English-language deck titles, not a graded answer.
 */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

export function matchesDeckSearch(
  deck: Pick<DeckSummary, "name" | "description">,
  query: string,
): boolean {
  const normalizedQuery = normalizeForSearch(query.trim());
  if (normalizedQuery.length === 0) return true;
  const haystack = normalizeForSearch(`${deck.name} ${deck.description ?? ""}`);
  return haystack.includes(normalizedQuery);
}

/**
 * A deck matches the type filter only on an exact content-type match: a
 * mixed deck answers "Both", never "Vocabulary". Spec 14 lists the three
 * values as peers rather than as a hierarchy. A deck with no content type
 * (every item archived) matches only the unfiltered default.
 */
export function matchesDeckContentFilter(
  deck: Pick<DeckSummary, "contentType">,
  filter: DeckContentFilter,
): boolean {
  if (filter === "all") return true;
  return deck.contentType === filter;
}

export function filterDecks<
  T extends Pick<DeckSummary, "name" | "description" | "contentType">,
>(
  decks: T[],
  {
    search,
    contentFilter,
  }: { search: string; contentFilter: DeckContentFilter },
): T[] {
  return decks.filter(
    (deck) =>
      matchesDeckSearch(deck, search) &&
      matchesDeckContentFilter(deck, contentFilter),
  );
}

export const DECK_CONTENT_TYPE_LABELS: Record<DeckContentType, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  both: "Vocabulary & Grammar",
};

/**
 * Deck card accent (spec 14's "icon/color"). Deliberately derived from what
 * the deck *contains* rather than stored as a per-deck color choice: it adds
 * no palette tokens, and it keeps ui-context.md's visual invariant that
 * vocabulary reads blue and grammar reads red wherever category color is
 * used. A mixed deck falls back to the primary sage accent. The card always
 * shows the type as text too — color never carries the meaning alone.
 */
export const DECK_ACCENT_CLASSES: Record<
  DeckContentType | "none",
  { border: string; icon: string; iconBackground: string }
> = {
  vocabulary: {
    border: "border-t-learning-vocabulary",
    icon: "text-learning-vocabulary",
    iconBackground: "bg-learning-vocabulary/15",
  },
  grammar: {
    border: "border-t-learning-grammar",
    icon: "text-learning-grammar",
    iconBackground: "bg-learning-grammar/15",
  },
  both: {
    border: "border-t-primary",
    icon: "text-primary",
    iconBackground: "bg-primary/15",
  },
  none: {
    border: "border-t-border",
    icon: "text-muted-foreground",
    iconBackground: "bg-muted",
  },
};
