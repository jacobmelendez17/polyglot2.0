import type { Metadata } from "next";

import { CreateDeckDialog } from "@/components/decks/create-deck-dialog";
import { DeckEmptyState } from "@/components/decks/deck-empty-state";
import { DeckFilters } from "@/components/decks/deck-filters";
import { DeckGrid } from "@/components/decks/deck-grid";
import { filterDecks, parseDeckContentFilter } from "@/domains/decks";
import type { DeckSummary } from "@/domains/decks";
import { listDecks } from "@/domains/decks/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Decks — Polyglot",
};

type DecksPageProps = {
  searchParams: Promise<{ q?: string; type?: string }>;
};

/**
 * Spec 14's `/decks`. Search and the type filter are URL state, so the
 * server holds the decks and does the filtering; the controls only navigate.
 *
 * Deck practice is supplementary by design, so nothing on this page reads or
 * writes SRS state — browsing decks cannot change curriculum progress.
 */
export default async function DecksPage({ searchParams }: DecksPageProps) {
  const { q, type } = await searchParams;
  const search = q ?? "";
  const contentFilter = parseDeckContentFilter(type);

  // proxy.ts protects /decks, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();
  const decks = await listDecks({
    userId: user.id,
    languageId: user.activeLanguageId,
  });

  const visible = filterDecks(decks, { search, contentFilter });
  const personal = visible.filter((deck) => deck.kind === "personal");
  const polyglot = visible.filter((deck) => deck.kind === "polyglot");
  const isFiltering = search.trim().length > 0 || contentFilter !== "all";
  const hasAnyDeck = decks.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Decks
        </h1>
        <CreateDeckDialog />
      </div>

      <DeckFilters search={search} contentFilter={contentFilter} />

      {isFiltering && visible.length === 0 ? (
        <DeckEmptyState
          title="No decks match"
          message="Nothing matches your search and filter. Try a different word, or switch the type filter back to All."
        />
      ) : (
        <>
          <DeckSection
            title="Your Decks"
            decks={personal}
            emptyTitle={
              isFiltering ? "No personal decks match" : "No decks yet"
            }
            emptyMessage={
              isFiltering
                ? "None of your own decks match this search and filter."
                : "Create a deck from items you have already learned to get extra practice, separate from your scheduled reviews."
            }
          />

          <DeckSection
            title="Polyglot Decks"
            decks={polyglot}
            emptyTitle={
              isFiltering ? "No Polyglot decks match" : "No Polyglot decks yet"
            }
            emptyMessage={
              isFiltering
                ? "No official decks match this search and filter."
                : hasAnyDeck
                  ? "Official decks unlock as you progress through the curriculum."
                  : "Official decks appear here as you unlock more of the curriculum."
            }
          />
        </>
      )}
    </div>
  );
}

type DeckSectionProps = {
  title: string;
  decks: DeckSummary[];
  emptyTitle: string;
  emptyMessage: string;
};

/**
 * A titled deck section. An empty personal section never hides the Polyglot
 * section, and vice versa (spec 14: "If the user has no personal decks,
 * continue showing Polyglot Decks normally").
 */
function DeckSection({
  title,
  decks,
  emptyTitle,
  emptyMessage,
}: DeckSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold text-foreground">
        {title}
      </h2>
      {decks.length === 0 ? (
        <DeckEmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <DeckGrid decks={decks} />
      )}
    </section>
  );
}
