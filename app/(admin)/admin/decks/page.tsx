import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreatePolyglotDeckDialog } from "@/components/admin/decks/create-polyglot-deck-dialog";
import { canPublishCurriculum } from "@/domains/admin";
import { getLanguages, getLevelsByLanguage } from "@/domains/curriculum/server";
import { listPolyglotDecks } from "@/domains/decks/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Decks — Polyglot Admin",
};

type SearchParams = { language?: string };

/**
 * Spec 14's Admin deck management. Only official Polyglot decks appear here
 * — a learner's personal deck is their own private content and is never
 * administrable, so it is not listed and the mutations reject it outright.
 */
export default async function AdminDecksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canPublishCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Decks" description="Create and manage official Polyglot decks." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((language) => language.id === params.language) ? params.language! : languages[0]!.id;
  const [decks, levels] = await Promise.all([listPolyglotDecks(languageId), getLevelsByLanguage(languageId)]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="Decks" description="Create and manage official Polyglot decks." />
        <CreatePolyglotDeckDialog
          languageId={languageId}
          levels={levels.map((level) => ({ id: level.id, levelNumber: level.levelNumber }))}
        />
      </div>

      {decks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Polyglot decks yet for this language. Add one to give learners a curated set of published items to practice.
        </p>
      ) : (
        <ul className="space-y-3">
          {decks.map((deck) => (
            <li key={deck.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/decks/${deck.id}`}
                    className="font-heading text-base font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {deck.name}
                  </Link>
                  {deck.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{deck.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deck.itemCount} {deck.itemCount === 1 ? "item" : "items"} ·{" "}
                    {deck.availability === "level"
                      ? `Hidden until Level ${deck.gateLevelNumber ?? "?"}`
                      : "Theme — reveals learned items"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
