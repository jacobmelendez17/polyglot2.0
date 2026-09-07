import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreateGroupDialog } from "@/components/admin/curriculum/create-group-dialog";
import { GroupLevelFilter } from "@/components/admin/curriculum/group-level-filter";
import { GroupReorderList } from "@/components/admin/curriculum/group-reorder-list";
import { canManageCurriculum } from "@/domains/admin";
import { getLanguages, getLevelsByLanguage, getVocabularyGroupsByLanguage } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Groups — Polyglot Admin",
};

type SearchParams = { language?: string; level?: string };

/**
 * Spec 11 rewrite's "Vocabulary Groups / Themes" list — scoped to one level
 * at a time (never "all levels"), since reordering only ever makes sense
 * within a single level's `position` sequence.
 */
export default async function AdminGroupsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Groups" description="Manage vocabulary groups/themes and their ordering within each level." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language) ? params.language! : languages[0]!.id;
  const levels = await getLevelsByLanguage(languageId);

  if (levels.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Groups" description="Manage vocabulary groups/themes and their ordering within each level." />
        <p className="text-sm text-muted-foreground">No levels yet — create a level first.</p>
      </div>
    );
  }

  const levelId = levels.some((l) => l.id === params.level) ? params.level! : levels[0]!.id;
  const groups = await getVocabularyGroupsByLanguage(languageId);
  const groupsForLevel = groups.filter((g) => g.levelId === levelId).sort((a, b) => a.position - b.position);
  const levelOptions = levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="Groups" description="Manage vocabulary groups/themes and their ordering within each level." />
        <CreateGroupDialog languageId={languageId} levels={levelOptions} defaultLevelId={levelId} />
      </div>

      <div className="mb-4">
        <GroupLevelFilter languageId={languageId} levels={levelOptions} value={levelId} />
      </div>

      <GroupReorderList levelId={levelId} groups={groupsForLevel.map((g) => ({ id: g.id, name: g.name, status: g.status }))} />
    </div>
  );
}
