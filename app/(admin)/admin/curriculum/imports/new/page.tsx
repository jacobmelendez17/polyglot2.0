import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreateAsyncImportForm } from "@/components/admin/curriculum/create-async-import-form";
import { canManageCurriculum } from "@/domains/admin";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "New Import — Polyglot Admin",
};

type SearchParams = { language?: string };

/**
 * Spec 19 §48 steps 12-13 — the asynchronous curriculum import upload
 * screen. Unlike `ImportVocabularyDialog` (the existing synchronous path,
 * still in place — §44's removal is a later step), this never parses or
 * previews anything itself: it only creates an import record and a
 * presigned upload slot, then hands off to `/admin/curriculum/imports/[importId]`
 * to watch the async Lambda pipeline do the rest.
 */
export default async function NewCurriculumImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) {
    forbidden();
  }

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="New Import" description="Upload a curriculum CSV or TSV file for asynchronous processing." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language) ? params.language! : languages[0]!.id;

  return (
    <div>
      <AdminPageHeader
        title="New Import"
        description="Upload a curriculum CSV or TSV file. Processing runs in the background — you can leave this page once the upload completes."
      />
      <CreateAsyncImportForm languageId={languageId} />
    </div>
  );
}
