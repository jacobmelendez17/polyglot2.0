import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminImportsListApp } from "@/components/admin/react-admin/imports/imports-list-app";
import { Button } from "@/components/ui/button";
import { canPublishCurriculum } from "@/domains/admin";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Curriculum Imports — Polyglot Admin",
};

type SearchParams = { language?: string };

/**
 * Spec 19 §19/§48 step 18 — normal (non-archived) import history, newest first.
 * A React Admin list since spec 26 Unit 8.
 *
 * This page keeps the server-side guard, the languages and the header's way
 * into the other import screens. The history itself — status badges, what each
 * import found, Archive — is fetched by the screen from
 * `/api/v1/admin/imports`, which reads `?language=` and `?cursor=` from the real
 * URL. Each file links to its own page, where the specialist screens stay (rows
 * that need a decision, corrections, Confirm, Retry, the explicit publish of
 * what an import drafted); "New Import" is the upload screen, unchanged.
 *
 * **Admin only** (`canPublishCurriculum`) since the owner's decision of
 * 2026-10-14: imports are an Admin's end to end, as the role matrix always said,
 * so a writer has neither this page, the pages behind it, nor a menu link to it.
 * Every endpoint behind it re-checks the same predicate from the database role
 * on every call.
 */
export default async function CurriculumImportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!canPublishCurriculum(user)) {
    forbidden();
  }

  const params = await searchParams;
  const languages = await getLanguages();
  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader
          title="Curriculum Imports"
          description="Asynchronous curriculum import history."
        />
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
          title="Curriculum Imports"
          description="Asynchronous curriculum import history."
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link
              href={`/admin/curriculum/imports/archived?language=${languageId}`}
            >
              Archived
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/curriculum/imports/new?language=${languageId}`}>
              New Import
            </Link>
          </Button>
        </div>
      </div>

      <AdminImportsListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((language) => ({
          id: language.id,
          name: language.name,
        }))}
        archived={false}
      />
    </div>
  );
}
