import Link from "next/link";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PolyglotDeckEditor } from "@/components/admin/decks/polyglot-deck-editor";
import { canManageCurriculum } from "@/domains/admin";
import { getLevelsByLanguage } from "@/domains/curriculum/server";
import { getPolyglotDeck, getPolyglotDeckItems } from "@/domains/decks/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Deck — Polyglot Admin",
};

// Same permissive UUID-shape check as the other deck routes.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Spec 14's Admin deck editor. A personal deck reaching this route 404s — it is not administrable content. */
export default async function AdminDeckDetailPage({ params }: { params: Promise<{ deckId: string }> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { deckId } = await params;
  if (!UUID_LIKE.test(deckId)) {
    notFound();
  }

  const deck = await getPolyglotDeck(deckId);
  if (!deck || deck.kind !== "polyglot") {
    notFound();
  }

  const [items, levels] = await Promise.all([getPolyglotDeckItems(deckId), getLevelsByLanguage(deck.languageId)]);

  return (
    <div>
      <Link href="/admin/decks" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← All decks
      </Link>
      <div className="mt-2 mb-4">
        <AdminPageHeader title={deck.name} description="Official deck — learners can practice it but never change it." />
      </div>

      <PolyglotDeckEditor
        deckId={deck.id}
        languageId={deck.languageId}
        name={deck.name}
        description={deck.description}
        availability={deck.availability}
        gateLevelId={deck.gateLevelId}
        levels={levels.map((level) => ({ id: level.id, levelNumber: level.levelNumber }))}
        items={items}
      />
    </div>
  );
}
