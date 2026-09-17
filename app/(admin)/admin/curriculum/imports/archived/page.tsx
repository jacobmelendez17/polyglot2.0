import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurriculumImportHistoryTable } from "@/components/admin/curriculum/curriculum-import-history-table";
import { Button } from "@/components/ui/button";
import { canManageCurriculum } from "@/domains/admin";
import { listArchivedCurriculumImportsForHistory } from "@/domains/admin/server";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Archived Imports — Polyglot Admin",
};

type SearchParams = { language?: string; cursor?: string };

/** Spec 19 §25/§48 step 19 — archived import history: restore, or permanently delete. */
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
  const page = await listArchivedCurriculumImportsForHistory({
    languageId,
    cursor: params.cursor,
    limit: 20,
  });

  const nextParams = new URLSearchParams({ language: languageId });
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader
          title="Archived Imports"
          description="Restore an import to normal history, or permanently delete it."
        />
        <Button asChild variant="outline">
          <Link href="/admin/curriculum/imports">Back to history</Link>
        </Button>
      </div>

      {page.items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-medium text-foreground">Nothing archived</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Archived imports will show up here.
          </p>
        </div>
      ) : (
        <>
          <CurriculumImportHistoryTable imports={page.items} archived />
          {page.nextCursor ? (
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/admin/curriculum/imports/archived?${nextParams.toString()}`}
                >
                  Next page
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
