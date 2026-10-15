import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreatePolyglotDeckDialog } from "@/components/admin/decks/create-polyglot-deck-dialog";
import { AdminDecksListApp } from "@/components/admin/react-admin/decks/decks-list-app";
import { canManageCurriculum, canPublishCurriculum } from "@/domains/admin";
import { getLanguages, getLevelsByLanguage } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Decks — Polyglot Admin",
};

type SearchParams = { language?: string };

/** What the page says it is for: an Admin manages; a writer reads. */
const describe = (canManage: boolean) =>
  canManage
    ? "Create and manage official Polyglot decks."
    : "Official Polyglot decks. An Admin creates and manages them.";

/**
 * Spec 14's Admin deck management. Only official Polyglot decks appear here
 * — a learner's personal deck is their own private content and is never
 * administrable, so it is not listed and the mutations reject it outright.
 *
 * A React Admin list since spec 26 Unit 10. This page keeps the server-side
 * guard, the languages and the "Add deck" dialog — creating a deck means
 * choosing its items, which is the specialist picker, so it stays here — and
 * the list itself is fetched by the screen from `/api/v1/admin/decks`, which
 * reads `?language=` from the real URL. Each deck links to its own page, where
 * membership, order and deletion (with its explicit confirmation) are edited;
 * those screens and their Server Actions are unchanged.
 *
 * **A writer may see the decks** (`canManageCurriculum`; the owner's decision of
 * 2026-10-14) and gets no "Add deck": creating, editing and deleting a deck are
 * an Admin's (`canPublishCurriculum`), which every Server Action re-checks.
 */
export default async function AdminDecksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();
  const canManage = canPublishCurriculum(user);

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Decks" description={describe(canManage)} />
        <p className="text-sm text-muted-foreground">
          No languages are configured yet.
        </p>
      </div>
    );
  }

  const languageId = languages.some(
    (language) => language.id === params.language,
  )
    ? params.language!
    : languages[0]!.id;
  // Only the "Add deck" dialog needs the levels (to gate a deck by one).
  const levels = canManage ? await getLevelsByLanguage(languageId) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="Decks" description={describe(canManage)} />
        {canManage ? (
          <CreatePolyglotDeckDialog
            languageId={languageId}
            levels={levels.map((level) => ({
              id: level.id,
              levelNumber: level.levelNumber,
            }))}
          />
        ) : null}
      </div>

      <AdminDecksListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((language) => ({
          id: language.id,
          name: language.name,
        }))}
      />
    </div>
  );
}
