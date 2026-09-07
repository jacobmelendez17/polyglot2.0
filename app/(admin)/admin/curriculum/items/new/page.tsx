import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurriculumItemForm } from "@/components/admin/curriculum/curriculum-item-form";
import { canManageCurriculum } from "@/domains/admin";
import { getLevelsByLanguage, getLanguages, getVocabularyGroupsByLanguage } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Add Item — Polyglot Admin",
};

type SearchParams = { language?: string };

/** Spec 11 rewrite's "Creating Items" — new records enter `pending` and are never learner-visible until explicitly published. */
export default async function NewCurriculumItemPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();
  const languageId = languages.some((l) => l.id === params.language) ? params.language! : (languages[0]?.id ?? "");

  const [levels, groups] = await Promise.all([getLevelsByLanguage(languageId), getVocabularyGroupsByLanguage(languageId)]);
  const levelNumberById = new Map(levels.map((level) => [level.id, level.levelNumber]));
  const groupOptions = groups
    .map((group) => ({ id: group.id, name: group.name, levelNumber: levelNumberById.get(group.levelId) ?? 0 }))
    .sort((a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name));

  return (
    <div>
      <AdminPageHeader title="Add item" description="New items are staged as Pending until you explicitly publish them." />
      <CurriculumItemForm languageId={languageId} levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))} groups={groupOptions} />
    </div>
  );
}
