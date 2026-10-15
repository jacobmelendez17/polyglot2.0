import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminDictionaryListApp } from "@/components/admin/react-admin/dictionary/dictionary-list-app";
import { canManageCurriculum } from "@/domains/admin";
import {
  getLanguages,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { getLexicalLanguageProvider } from "@/domains/lexicon";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Dictionary — Polyglot Admin",
};

type SearchParams = { language?: string };

/**
 * Spec 12 "Admin Mapping Review" — the mapping queue. Admin and writer,
 * re-checked here independently of the layout's broader area check, since a
 * developer without the admin role is admitted to `/admin` but not to
 * curriculum surfaces (spec 11 §4).
 *
 * A React Admin list since spec 26 Unit 9. This page keeps the server-side
 * guard and the lookups the filters need — the selected language's levels,
 * groups and the regions its dictionary covers — and the queue itself, its
 * status counts and its paging are fetched by the screen from
 * `/api/v1/admin/dictionary`, which reads every filter and the offset from the
 * real URL. A language switch is a navigation, so the lookups below follow it.
 *
 * Read-only by design: the queue finds work and links to the item editor,
 * where the mapping panel owns every mutation. One place that changes a
 * mapping, not two. (The one command here is the batch confirmation of
 * reviewed matches, the existing Server Action behind a confirmation.)
 */
export default async function AdminDictionaryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader
          title="Dictionary"
          description="Review how curriculum vocabulary maps onto dictionary entries."
        />
        <p className="text-sm text-muted-foreground">
          No languages are configured yet.
        </p>
      </div>
    );
  }

  const language =
    languages.find((candidate) => candidate.id === params.language) ??
    languages[0]!;
  const provider = getLexicalLanguageProvider(language.code);

  const [levels, groups] = await Promise.all([
    getLevelsByLanguage(language.id),
    getVocabularyGroupsByLanguage(language.id),
  ]);
  const levelNumberById = new Map(
    levels.map((level) => [level.id, level.levelNumber]),
  );

  return (
    <div>
      <AdminPageHeader
        title="Dictionary"
        description="Review how curriculum vocabulary maps onto imported dictionary entries."
      />

      <AdminDictionaryListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
        }))}
        levels={levels.map((level) => ({
          id: level.id,
          levelNumber: level.levelNumber,
        }))}
        groups={groups
          .map((group) => ({
            id: group.id,
            name: group.name,
            levelNumber: levelNumberById.get(group.levelId) ?? 0,
          }))
          .sort(
            (a, b) =>
              a.levelNumber - b.levelNumber || a.name.localeCompare(b.name),
          )}
        regionCodes={[...provider.regionCodes]}
      />
    </div>
  );
}
