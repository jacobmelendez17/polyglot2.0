import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurriculumFilters } from "@/components/admin/curriculum/curriculum-filters";
import { CurriculumPagination } from "@/components/admin/curriculum/curriculum-pagination";
import { CurriculumTable } from "@/components/admin/curriculum/curriculum-table";
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
        <AdminPageHeader title="Curriculum" description="Search, filter, create, edit, and publish official curriculum." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language) ? params.language! : languages[0]!.id;
  const type = ITEM_TYPES.includes(params.type as (typeof ITEM_TYPES)[number]) ? (params.type as "vocabulary" | "grammar") : undefined;
  const status = STATUSES.includes(params.status as CurriculumStatus) ? (params.status as CurriculumStatus) : undefined;

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
      limit: PAGE_SIZE,
      cursor: params.cursor,
    }),
  ]);

  const levelNumberById = new Map(levels.map((level) => [level.id, level.levelNumber]));
  const groupOptions = groups
    .map((group) => ({ id: group.id, name: group.name, levelNumber: levelNumberById.get(group.levelId) ?? 0 }))
    .sort((a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name));

  const nextParams = new URLSearchParams();
  nextParams.set("language", languageId);
  if (params.level) nextParams.set("level", params.level);
  if (type) nextParams.set("type", type);
  if (status) nextParams.set("status", status);
  if (params.group) nextParams.set("group", params.group);
  if (params.search) nextParams.set("search", params.search);
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  return (
    <div>
      <AdminPageHeader title="Curriculum" description="Search, filter, create, edit, and publish official curriculum." />

      <CurriculumFilters
        languages={languages}
        levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
        groups={groupOptions}
        value={{ languageId, levelId: params.level, type, status, groupId: params.group, search: params.search }}
      />

      <CurriculumTable items={page.items} />

      {page.nextCursor ? (
        <CurriculumPagination nextHref={`/admin/curriculum?${nextParams.toString()}`} />
      ) : null}
    </div>
  );
}
