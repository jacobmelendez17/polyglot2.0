import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminImportsListApp } from "@/components/admin/react-admin/imports/imports-list-app";
import { Button } from "@/components/ui/button";
import { canManageCurriculum } from "@/domains/admin";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Archived Imports — Polyglot Admin",
};

type SearchParams = { language?: string };

/**
 * Spec 19 §25/§48 step 19 — archived import history: restore, or permanently
 * delete. A React Admin list since spec 26 Unit 8; the same screen as the normal
 * history, asking for the archived one. Guard and visibility are the history
 * page's: anyone who can author may read it, and Restore and Permanently delete
 * need `canPublishCurriculum` (the endpoints re-check it on every call).
 */
export default async function ArchivedCurriculumImportsPage({
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
        <AdminPageHeader title="Archived Imports" />
        <p className="text-sm text-muted-foreground">
          No languages are configured yet.
        </p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language)
    ? params.language!
    : languages[0]!.id;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader
          title="Archived Imports"
          description="Restore an import to normal history, or permanently delete it."
        />
        <Button asChild variant="outline">
          <Link href={`/admin/curriculum/imports?language=${languageId}`}>
            Back to history
          </Link>
        </Button>
      </div>

      <AdminImportsListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((language) => ({
          id: language.id,
          name: language.name,
        }))}
        archived
      />
    </div>
  );
}
