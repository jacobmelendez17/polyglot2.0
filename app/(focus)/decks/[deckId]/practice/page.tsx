import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DeckPracticeView } from "@/components/decks/deck-practice-view";
import { startDeckPractice } from "@/domains/decks/server";
import { requireUser } from "@/domains/users/server";
import { DeckError } from "@/lib/errors/deck-errors";

export const metadata: Metadata = {
  title: "Deck practice — Polyglot",
};

type DeckPracticePageProps = {
  params: Promise<{ deckId: string }>;
};

// Same permissive UUID-shape check as the other deck routes.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spec 14's deck practice session, in the focused learning layout lessons
 * and reviews already use. The server builds the question set — which items,
 * in which directions, in what order — because that depends on curriculum
 * the browser does not have; the browser is handed prompts only, never
 * accepted answers.
 *
 * Nothing on this route writes. A deck whose practicable items have all been
 * archived (or which the learner cannot see at all) 404s rather than opening
 * an empty session.
 */
export default async function DeckPracticePage({ params }: DeckPracticePageProps) {
  const { deckId } = await params;
  if (!UUID_LIKE.test(deckId)) {
    notFound();
  }

  // proxy.ts protects /decks, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();

  let session;
  try {
    session = await startDeckPractice({ userId: user.id, languageId: user.activeLanguageId, deckId });
  } catch (error) {
    // A deck the learner cannot see, and one with nothing left to practice,
    // both resolve to "there is no session here" rather than an error page.
    if (error instanceof DeckError && (error.code === "DECK_NOT_FOUND" || error.code === "DECK_MUST_HAVE_ITEMS")) {
      notFound();
    }
    throw error;
  }

  return (
    <DeckPracticeView
      deckId={session.deckId}
      deckName={session.deckName}
      itemCount={session.itemCount}
      questions={session.questions}
      characterHelpers={session.characterHelpers}
    />
  );
}
