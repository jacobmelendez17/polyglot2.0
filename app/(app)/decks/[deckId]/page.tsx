import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play } from "lucide-react";

import { AddDeckItemsDialog } from "@/components/decks/add-deck-items-dialog";
import { DeckEmptyState } from "@/components/decks/deck-empty-state";
import { DeckItemList } from "@/components/decks/deck-item-list";
import { DeckManageList } from "@/components/decks/deck-manage-list";
import { DeckSettingsDialog } from "@/components/decks/deck-settings-dialog";
import { DeleteDeckDialog } from "@/components/decks/delete-deck-dialog";
import { Button } from "@/components/ui/button";
import { DECK_CONTENT_TYPE_LABELS } from "@/domains/decks";
import { getDeck } from "@/domains/decks/server";
import { requireUser } from "@/domains/users/server";

type DeckDetailPageProps = {
  params: Promise<{ deckId: string }>;
};

// Same permissive UUID-shape check as `app/(app)/items/[itemId]/page.tsx`:
// this codebase's seeded ids are valid Postgres uuids but not RFC 4122
// version/variant compliant. Checked before any query runs so a malformed id
// 404s cleanly instead of surfacing a raw Postgres cast error.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: DeckDetailPageProps): Promise<Metadata> {
  const { deckId } = await params;
  if (!UUID_LIKE.test(deckId)) return { title: "Polyglot" };

  const user = await requireUser();
  const deck = await getDeck({ userId: user.id, languageId: user.activeLanguageId, deckId });
  return { title: deck ? `${deck.name} — Polyglot` : "Polyglot" };
}

/**
 * Spec 14's `/decks/[deckId]`. A deck the learner cannot see — someone
 * else's personal deck, or a Level deck whose Level is still locked — is
 * indistinguishable from one that does not exist, so both 404 rather than
 * revealing that a deck is there but withheld.
 *
 * `canManage` comes from the server, and every management action re-checks
 * ownership independently: a Polyglot deck renders no edit controls *and*
 * would reject them.
 */
export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const { deckId } = await params;
  if (!UUID_LIKE.test(deckId)) {
    notFound();
  }

  // proxy.ts protects /decks, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();
  const deck = await getDeck({ userId: user.id, languageId: user.activeLanguageId, deckId });
  if (!deck) {
    notFound();
  }

  const itemCount = deck.items.length;
  const typeLabel = deck.contentType ? DECK_CONTENT_TYPE_LABELS[deck.contentType] : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-3 py-6 sm:px-4">
      <div className="flex flex-col gap-3">
        <Link href="/decks" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← All decks
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold text-foreground">{deck.name}</h1>
            {deck.description ? <p className="mt-1 text-sm text-muted-foreground">{deck.description}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "items"}
              {typeLabel ? ` · ${typeLabel}` : ""}
              {deck.kind === "polyglot" ? " · Polyglot Deck" : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {deck.canManage ? (
              <>
                <AddDeckItemsDialog deckId={deck.id} existingItemIds={deck.items.map((item) => item.learningItemId)} />
                <DeckSettingsDialog deckId={deck.id} name={deck.name} description={deck.description} />
                <DeleteDeckDialog deckId={deck.id} deckName={deck.name} />
              </>
            ) : null}
            {/* A disabled <a> is not actually disabled, so an empty deck
                renders a real disabled button rather than a dead link. */}
            {itemCount === 0 ? (
              <Button disabled title="This deck has nothing to practice yet">
                <Play aria-hidden="true" />
                Practice Deck
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/decks/${deck.id}/practice`}>
                  <Play aria-hidden="true" />
                  Practice Deck
                </Link>
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Deck practice is extra study. It never changes your SRS stages, review times, or curriculum progress.
        </p>
      </div>

      {itemCount === 0 ? (
        <DeckEmptyState
          title="Nothing to practice yet"
          message={
            deck.kind === "polyglot"
              ? "This deck fills in as you learn the curriculum items it covers. Come back after a few more lessons."
              : // A personal deck can only reach this state through something
                // outside the deck itself — a progress reset, or an item
                // archived out of the curriculum — so the copy names both
                // rather than guessing at one.
                "Nothing in this deck is available to practice right now. That happens after a progress reset, or if its items were archived from the curriculum. Add another item to start practicing again."
          }
        />
      ) : deck.canManage ? (
        <DeckManageList deckId={deck.id} items={deck.items} />
      ) : (
        <DeckItemList items={deck.items} />
      )}
    </div>
  );
}
