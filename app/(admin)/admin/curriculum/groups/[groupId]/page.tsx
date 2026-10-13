import Link from "next/link";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { groupsListHref } from "@/components/admin/react-admin/groups/group-list-params";
import { AdminGroupEditApp } from "@/components/admin/react-admin/groups/group-edit-app";
import { adminGroupPathSchema, canManageCurriculum } from "@/domains/admin";
import { getLevelById, getVocabularyGroup } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

/**
 * An id that is not shaped like one cannot be a group, and the database would
 * refuse it as a fault (a 500) instead of answering "no such group" (a 404).
 */
const isGroupId = (value: string) =>
  adminGroupPathSchema.safeParse({ groupId: value }).success;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;
  const group = isGroupId(groupId) ? await getVocabularyGroup(groupId) : null;
  return {
    title: group ? `${group.name} — Polyglot Admin` : "Group — Polyglot Admin",
  };
}

/**
 * Spec 11 rewrite's "Vocabulary Groups / Themes" detail/edit page. Spec 26
 * Unit 5 moved the group's own properties (name, status) onto a React Admin
 * form — editable for an Admin, read-only for a writer. The heading stays
 * server-rendered; the form asks the page to re-render after a save, so the
 * heading follows a rename.
 *
 * The link back returns to the list of this group's level, in its language, so
 * the view the person came from is the view they return to (the group's own
 * level and language, which never need to be carried in the URL).
 */
export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { groupId } = await params;
  if (!isGroupId(groupId)) notFound();
  const group = await getVocabularyGroup(groupId);
  if (!group) notFound();

  const level = await getLevelById(group.levelId);

  return (
    <div>
      <div className="mb-4">
        <Link
          href={groupsListHref({
            language: group.languageId,
            level: group.levelId,
          })}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {level ? `← Level ${level.levelNumber} groups` : "← Groups"}
        </Link>
      </div>
      <AdminPageHeader
        title={group.name}
        description={
          level
            ? `Vocabulary group in Level ${level.levelNumber} — lesson ${group.position}`
            : "Vocabulary group"
        }
      />
      {/* `key` remounts the form when navigating to another group: Next reuses
          this page component across two `[groupId]` routes, and the form keeps
          the previous group's values in its own state. */}
      <AdminGroupEditApp
        key={group.id}
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        groupId={group.id}
        fields={{ name: group.name, status: group.status }}
      />
    </div>
  );
}
