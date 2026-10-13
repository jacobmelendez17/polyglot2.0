import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { GroupReorderList } from "@/components/admin/curriculum/group-reorder-list";
import { groupsListHref } from "@/components/admin/react-admin/groups/group-list-params";
import { AdminGroupsListApp } from "@/components/admin/react-admin/groups/groups-list-app";
import { canManageCurriculum, canPublishCurriculum } from "@/domains/admin";
import {
  getLanguages,
  getLevelsByLanguage,
  getVocabularyGroupsByLevel,
} from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Groups — Polyglot Admin",
};

type SearchParams = { language?: string; level?: string; mode?: string };

const DESCRIPTION =
  "Manage vocabulary groups/themes and their ordering within each level.";

/**
 * Spec 11 rewrite's "Vocabulary Groups / Themes" list — scoped to one level
 * at a time (never "all levels"), since a group's position is its lesson number
 * *within its own level*. A React Admin screen since spec 26 Unit 5.
 *
 * This page keeps the server-side guard, the languages, the selected language's
 * levels, and the specialist reorder tool. The groups themselves — with the
 * "Add group" command and the language and level switches — are fetched by the
 * screen from `/api/v1/admin/groups`, which reads `?language=` and `?level=`
 * from the real URL. Each group links to its page, where its name and status
 * are edited.
 *
 * **Reorder mode** (`?mode=reorder`) is the specialist `GroupReorderList`,
 * unchanged, for one level: ordering is deliberately *not* a React Admin list
 * sort, because the position it would persist is the lesson number learners
 * see. It is reached by a link only someone allowed to reorder sees, and only
 * honoured for them (`canPublishCurriculum`, which the reorder action re-checks
 * from the database role on every call): a writer who types the URL by hand
 * gets the browsing list.
 *
 * Visible to anyone who can author, so a writer can see the groups they write
 * into; adding, editing or reordering one requires `canPublishCurriculum`.
 */
export default async function AdminGroupsPage({
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
        <AdminPageHeader title="Groups" description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">
          No languages are configured yet.
        </p>
      </div>
    );
  }

  // Resolved exactly as the screen resolves them from the same URL (an unknown
  // value falls back to the first), so the levels handed down are always the
  // selected language's.
  const languageId = languages.some((l) => l.id === params.language)
    ? params.language!
    : languages[0]!.id;
  const levels = await getLevelsByLanguage(languageId);
  const levelId = levels.some((l) => l.id === params.level)
    ? params.level!
    : levels[0]?.id;
  const level = levels.find((l) => l.id === levelId);

  if (level && params.mode === "reorder" && canPublishCurriculum(user)) {
    // Every group of the level, not a page of them: a saved order assigns
    // positions 1..N to whatever it is given, so an order with groups missing
    // from it would not be the level's order.
    const groups = (await getVocabularyGroupsByLevel(level.id)).sort(
      (a, b) => a.position - b.position,
    );

    return (
      <div>
        <AdminPageHeader title="Groups" description={DESCRIPTION} />
        <div className="mb-4 space-y-2">
          <Link
            href={groupsListHref({ language: languageId, level: level.id })}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Back to browsing
          </Link>
          <p className="text-sm text-muted-foreground">
            Reordering the groups of Level {level.levelNumber}. The order here
            is the order of its lessons.
          </p>
        </div>
        {/* `key={level.id}` forces a remount when the level changes.
            Without it, switching levels sends GroupReorderList fresh `groups`
            props but React reuses the same instance, so its own `order` state
            (a lazy `useState` initializer that only ever runs once) keeps the
            previous level's group ids — every one of which is then missing
            from the new level's id→group map, so every row silently renders
            as null and the list looks empty even though the new level's
            groups are real and published. Found 2026-09-27 from a user report
            of exactly this: newly created, published Level 2 groups not
            appearing after having viewed a different level first. */}
        <GroupReorderList
          key={level.id}
          levelId={level.id}
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            status: g.status,
          }))}
        />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader title="Groups" description={DESCRIPTION} />
      <AdminGroupsListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((language) => ({
          id: language.id,
          name: language.name,
        }))}
        levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
      />
    </div>
  );
}
