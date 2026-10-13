import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminLevelsListApp } from "@/components/admin/react-admin/levels/levels-list-app";
import { canManageCurriculum } from "@/domains/admin";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Levels — Polyglot Admin",
};

/**
 * Spec 11 rewrite's "Levels Management" list — every configured level for a
 * language with its live curriculum counts, so an admin can see at a glance
 * what each holds without opening it (§"Show curriculum counts"). A React Admin
 * screen since spec 26 Unit 4.
 *
 * This page keeps only the server-side guard and the languages. The levels
 * themselves — with their counts, the "Add level" command, and the language
 * switch — are fetched by the screen from `/api/v1/admin/levels`, which reads
 * `?language=` from the real URL. Each level links to its detail page, where
 * the specialist `LevelItemBoard` stays.
 *
 * Visible to anyone who can author, so a writer can see the levels they write
 * into; adding or editing one requires `canPublishCurriculum`, which the
 * endpoints re-check from the database role on every call and which the screen
 * never infers from what rendered.
 */
export default async function AdminLevelsPage() {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const languages = await getLanguages();
  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader
          title="Levels"
          description="Manage level properties, ordering, and publication."
        />
        <p className="text-sm text-muted-foreground">
          No languages are configured yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Levels"
        description="Manage level properties, ordering, and publication."
      />
      <AdminLevelsListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((language) => ({
          id: language.id,
          name: language.name,
        }))}
      />
    </div>
  );
}
