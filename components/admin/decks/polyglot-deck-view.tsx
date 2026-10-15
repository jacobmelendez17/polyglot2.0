import type { DeckItemRow } from "@/domains/decks";

import { deckAvailabilityText } from "./deck-availability-text";

type PolyglotDeckViewProps = {
  description: string | null;
  availability: "theme" | "level";
  /** The number of the level that unlocks a `level` deck. */
  gateLevelNumber: number | null;
  items: DeckItemRow[];
};

/**
 * One official deck, read-only: what a writer sees where an Admin has the
 * editor (spec 14; the owner's decision of 2026-10-14 that a writer may *see*
 * the official decks). It shows the same things the editor holds — the details,
 * when learners see the deck, and its items in their order — and none of the
 * controls: there is nothing here to save, add, reorder or delete.
 *
 * A plain server component. Seeing a deck is not authorization to change it: the
 * editor's Server Actions each re-check `canPublishCurriculum`, and this page
 * renders them for no one but an Admin.
 */
export function PolyglotDeckView({
  description,
  availability,
  gateLevelNumber,
  items,
}: PolyglotDeckViewProps) {
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="deck-details-heading"
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <h2
          id="deck-details-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Details
        </h2>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium text-foreground">Description</dt>
            <dd className="text-muted-foreground">{description ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Availability</dt>
            <dd className="text-muted-foreground">
              {deckAvailabilityText({ availability, gateLevelNumber })}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="deck-items-heading" className="space-y-3">
        <h2
          id="deck-items-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Items ({items.length})
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item) => (
            <li key={item.learningItemId} className="px-3 py-2">
              <span className="block truncate text-sm font-medium text-foreground">
                {item.primary}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.secondary} ·{" "}
                {item.itemType === "vocabulary" ? "Vocabulary" : "Grammar"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
