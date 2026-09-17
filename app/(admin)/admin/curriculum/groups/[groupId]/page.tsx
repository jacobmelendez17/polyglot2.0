import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { GroupEditForm } from "@/components/admin/curriculum/group-edit-form";
import { canManageCurriculum } from "@/domains/admin";
import { getLevelById, getVocabularyGroup } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;
  const group = await getVocabularyGroup(groupId);
  return {
    title: group ? `${group.name} — Polyglot Admin` : "Group — Polyglot Admin",
  };
}

/** Spec 11 rewrite's "Vocabulary Groups / Themes" detail/edit page. */
export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { groupId } = await params;
  const group = await getVocabularyGroup(groupId);
  if (!group) notFound();

  const level = await getLevelById(group.levelId);

  return (
    <div>
      <AdminPageHeader
        title={group.name}
        description={
          level
            ? `Vocabulary group in Level ${level.levelNumber}`
            : "Vocabulary group"
        }
      />
      <GroupEditForm
        groupId={group.id}
        name={group.name}
        status={group.status}
      />
    </div>
  );
}
