import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { CurriculumFilters } from "@/components/admin/curriculum/curriculum-filters";
import { CurriculumPagination } from "@/components/admin/curriculum/curriculum-pagination";
import { CurriculumTableSection } from "@/components/admin/curriculum/curriculum-table-section";
import { ItemReorderList } from "@/components/admin/curriculum/item-reorder-list";
import { canManageCurriculum } from "@/domains/admin";
import type { CurriculumStatus } from "@/domains/curriculum";
import {
  getAdminCurriculumItems,
  getLanguages,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Curriculum — Polyglot Admin",
};

const PAGE_SIZE = 20;
// getAdminCurriculumItemsInputSchema caps `limit` at 100 — this is that cap,
// used as-is (not a separate, larger constant) so reorder mode never
// exceeds it. Still comfortably above CURRICULUM_VALIDATION_CONFIG's
// 48-vocabulary-per-level target: reorder mode needs every item in the
// level+type at once (not one paginated page), since `reorderItems`
// assigns positions 1..N to whatever list it's given — leaving items out of
// that list would desync their position from the ones that were reordered.
const REORDER_LIMIT = 100;
const ITEM_TYPES = ["vocabulary", "grammar"] as const;
const STATUSES = ["draft", "pending", "published", "archived"] as const;

type SearchParams = {
  language?: string;
  level?: string;
  type?: string;
  status?: string;
  group?: string;
  search?: string;
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
  const type = ITEM_TYPES.includes(params.type as (typeof ITEM_TYPES)[number])
    ? (params.type as "vocabulary" | "grammar")
    : undefined;
  const status = STATUSES.includes(params.status as CurriculumStatus)
    ? (params.status as CurriculumStatus)
    : undefined;
  // Reordering only makes sense scoped to exactly one level and one type —
  // `position` is uniquely constrained within `(level, type)`, never across
  // either (see reorderLearningItems).
  const canReorder = Boolean(params.level && type);
  const reorderMode = canReorder && params.mode === "reorder";

  const [levels, groups, page] = await Promise.all([
    getLevelsByLanguage(languageId),
    getVocabularyGroupsByLanguage(languageId),
    getAdminCurriculumItems({
      languageId,
      levelId: params.level,
      type,
      status,
      groupId: params.group,
      search: params.search,
      limit: reorderMode ? REORDER_LIMIT : PAGE_SIZE,
      cursor: reorderMode ? undefined : params.cursor,
    }),
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

  const nextParams = new URLSearchParams(baseParams);
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

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

      <CurriculumFilters
        languages={languages}
        levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
        groups={groupOptions}
        value={{
          languageId,
          levelId: params.level,
          type,
          status,
          groupId: params.group,
          search: params.search,
        }}
      />

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
        <ItemReorderList
          levelId={params.level!}
          type={type!}
          items={page.items}
        />
      ) : (
        <>
          <CurriculumTableSection
            items={page.items}
            levels={levels.map((l) => ({
              id: l.id,
              levelNumber: l.levelNumber,
            }))}
            groups={groupOptions}
          />
          {page.nextCursor ? (
            <CurriculumPagination
              nextHref={`/admin/curriculum?${nextParams.toString()}`}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
