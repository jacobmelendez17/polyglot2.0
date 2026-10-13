import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { ItemReorderList } from "@/components/admin/curriculum/item-reorder-list";
import { LevelContentSummaryCard } from "@/components/admin/curriculum/level-content-summary-card";
import { AdminCurriculumListApp } from "@/components/admin/react-admin/curriculum/curriculum-list-app";
import {
  CURRICULUM_ITEM_TYPES,
  CURRICULUM_NEEDS_FILTERS,
  CURRICULUM_STATUSES,
  canManageCurriculum,
} from "@/domains/admin";
import {
  getAdminCurriculumItems,
  getLanguages,
  getLevelContentSummary,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Curriculum — Polyglot Admin",
};

// getAdminCurriculumItemsInputSchema caps `limit` at 100 — this is that cap,
// used as-is (not a separate, larger constant) so reorder mode never
// exceeds it. Still comfortably above CURRICULUM_VALIDATION_CONFIG's
// 48-vocabulary-per-level target: reorder mode needs every item in the
// level+type at once (not one paginated page), since `reorderItems`
// assigns positions 1..N to whatever list it's given — leaving items out of
// that list would desync their position from the ones that were reordered.
const REORDER_LIMIT = 100;

type SearchParams = {
  language?: string;
  level?: string;
  type?: string;
  status?: string;
  group?: string;
  search?: string;
  needs?: string;
  cursor?: string;
  mode?: string;
};

/**
 * Curriculum-management route (spec 11 §8-§35, Unit 3). Admin only —
 * re-checked here independently of the layout's broader
 * `canAccessAdminArea` check, since a developer without the admin role is
 * admitted to `/admin` but not to this route (spec 11 §4).
 *
 * Filter/search/pagination state lives in the URL (`?language=&level=&...`),
 * not component state, so a filtered view is bookmarkable and a refresh
 * doesn't lose it (code-standards.md's URL-state rule).
 *
 * The list itself is a React Admin screen (spec 26 Unit 2) that fetches its
 * own rows from `/api/v1/admin/curriculum`; this page keeps the server-side
 * guard, the header actions, the per-level summary, and reorder mode.
 */
export default async function AdminCurriculumPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) {
    forbidden();
  }

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader
          title="Curriculum"
          description="Search, filter, create, edit, and publish official curriculum."
        />
        <p className="text-sm text-muted-foreground">
          No languages are configured yet.
        </p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language)
    ? params.language!
    : languages[0]!.id;
  const type = CURRICULUM_ITEM_TYPES.find(
    (candidate) => candidate === params.type,
  );
  const status = CURRICULUM_STATUSES.find(
    (candidate) => candidate === params.status,
  );
  const needs = CURRICULUM_NEEDS_FILTERS.find(
    (candidate) => candidate === params.needs,
  );
  // Reordering only makes sense scoped to exactly one level and one type —
  // `position` is uniquely constrained within `(level, type)`, never across
  // either (see reorderLearningItems).
  const canReorder = Boolean(params.level && type);
  const reorderMode = canReorder && params.mode === "reorder";

  const [levels, groups, reorderPage, levelSummary] = await Promise.all([
    getLevelsByLanguage(languageId),
    getVocabularyGroupsByLanguage(languageId),
    // The list itself is fetched by the React Admin screen, from
    // `/api/v1/admin/curriculum`. Only reorder mode — a specialist, still
    // server-rendered view that needs every item in one level+type at once —
    // loads items here.
    reorderMode
      ? getAdminCurriculumItems({
          languageId,
          levelId: params.level,
          type,
          status,
          groupId: params.group,
          search: params.search,
          needs,
          limit: REORDER_LIMIT,
        })
      : Promise.resolve(null),
    // Spec 25 §15's per-level summary only makes sense scoped to one level.
    params.level
      ? getLevelContentSummary({ languageId, levelId: params.level })
      : Promise.resolve(null),
  ]);

  const levelNumberById = new Map(
    levels.map((level) => [level.id, level.levelNumber]),
  );
  const groupOptions = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      levelNumber: levelNumberById.get(group.levelId) ?? 0,
    }))
    .sort(
      (a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name),
    );

  const baseParams = new URLSearchParams();
  baseParams.set("language", languageId);
  if (params.level) baseParams.set("level", params.level);
  if (type) baseParams.set("type", type);
  if (status) baseParams.set("status", status);
  if (params.group) baseParams.set("group", params.group);
  if (params.search) baseParams.set("search", params.search);
  if (needs) baseParams.set("needs", needs);

  const reorderParams = new URLSearchParams(baseParams);
  reorderParams.set("mode", "reorder");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader
          title="Curriculum"
          description="Search, filter, create, edit, and publish official curriculum."
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/curriculum/imports/new?language=${languageId}`}>
              Import
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/curriculum/items/new?language=${languageId}`}>
              Add item
            </Link>
          </Button>
        </div>
      </div>

      {levelSummary ? (
        <div className="mb-4">
          <LevelContentSummaryCard
            levelNumber={levelNumberById.get(params.level!) ?? 0}
            summary={levelSummary}
          />
        </div>
      ) : null}

      {canReorder ? (
        <div className="mb-4">
          {reorderMode ? (
            <Link
              href={`/admin/curriculum?${baseParams.toString()}`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              ← Back to browsing
            </Link>
          ) : (
            <Link
              href={`/admin/curriculum?${reorderParams.toString()}`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Reorder items in this level/type
            </Link>
          )}
        </div>
      ) : null}

      {reorderMode ? (
        // `key` forces a remount when the level/type scope changes — same
        // fix, same reason, as GroupReorderList's own key (see that
        // component's render site for the full explanation): without it, a
        // link that changes `level`/`type` while staying in reorder mode
        // would leave ItemReorderList's own `order` state pointing at the
        // previous scope's item ids, which are missing from the new scope's
        // id→item map, silently rendering every row as null.
        <ItemReorderList
          key={`${params.level}-${type}`}
          levelId={params.level!}
          type={type!}
          items={reorderPage?.items ?? []}
        />
      ) : (
        <AdminCurriculumListApp
          signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
          languages={languages.map((l) => ({ id: l.id, name: l.name }))}
          levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
          groups={groupOptions}
        />
      )}
    </div>
  );
}
