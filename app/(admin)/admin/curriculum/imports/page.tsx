import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurriculumImportHistoryTable } from "@/components/admin/curriculum/curriculum-import-history-table";
import { Button } from "@/components/ui/button";
import { canManageCurriculum } from "@/domains/admin";
import { listActiveCurriculumImports } from "@/domains/admin/server";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Curriculum Imports — Polyglot Admin",
};

type SearchParams = { language?: string; cursor?: string };

/** Spec 19 §19/§48 step 18 — normal (non-archived) import history, newest first. */
export default async function CurriculumImportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) {
    forbidden();
  }

  const params = await searchParams;
  const languages = await getLanguages();
  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Curriculum Imports" description="Asynchronous curriculum import history." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language) ? params.language! : languages[0]!.id;
  const page = await listActiveCurriculumImports({ languageId, cursor: params.cursor, limit: 20 });

  const nextParams = new URLSearchParams({ language: languageId });
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="Curriculum Imports" description="Asynchronous curriculum import history." />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/curriculum/imports/archived">Archived</Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/curriculum/imports/new?language=${languageId}`}>New Import</Link>
          </Button>
        </div>
      </div>

      {page.items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-medium text-foreground">No imports yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Start one from &ldquo;New Import&rdquo; above.</p>
        </div>
      ) : (
        <>
          <CurriculumImportHistoryTable imports={page.items} showArchiveAction />
          {page.nextCursor ? (
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/curriculum/imports?${nextParams.toString()}`}>Next page</Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
