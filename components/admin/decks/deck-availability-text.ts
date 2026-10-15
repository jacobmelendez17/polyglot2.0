/**
 * When learners see an official deck, in the words the Admin decks list has
 * always used. A plain module (no `"use client"`) so the list's table, a client
 * component, and the read-only deck page, a server one, say it the same way.
 */
export function deckAvailabilityText(deck: {
  availability: "theme" | "level";
  gateLevelNumber: number | null;
}): string {
  return deck.availability === "level"
    ? `Hidden until Level ${deck.gateLevelNumber ?? "?"}`
    : "Theme — reveals learned items";
}
