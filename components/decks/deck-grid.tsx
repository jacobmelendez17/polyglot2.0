import { DeckCard } from "@/components/decks/deck-card";
import type { DeckSummary } from "@/domains/decks";

type DeckGridProps = {
  decks: DeckSummary[];
};

/** Responsive card grid (spec 14) — one column on mobile, widening with the viewport rather than shrinking a desktop layout. */
export function DeckGrid({ decks }: DeckGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {decks.map((deck) => (
        <li key={deck.id} className="h-full">
          <DeckCard deck={deck} />
        </li>
      ))}
    </ul>
  );
}
