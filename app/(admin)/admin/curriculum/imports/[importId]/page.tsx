import Link from "next/link";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AsyncImportStatus } from "@/components/admin/curriculum/async-import-status";
import { canManageCurriculum } from "@/domains/admin";
import { getCurriculumImportStatus } from "@/domains/admin/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Import Status — Polyglot Admin",
};

/**
 * Spec 19 §48 steps 12-13 — watches one asynchronous import through the
 * real S3 → SQS → Lambda pipeline (verified end-to-end in units 1-11) and
 * lets the Admin resolve review-required rows and confirm. The initial
 * record is fetched server-side so the first render isn't a loading flash;
 * `AsyncImportStatus` takes over polling from there (spec 19 §38).
 */
export default async function CurriculumImportStatusPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) {
    forbidden();
  }

  const { importId } = await params;
  const record = await getCurriculumImportStatus(importId);
  if (!record) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/admin/curriculum/imports"
        className="mb-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Back to Imports
      </Link>
      <AdminPageHeader title="Import" description={record.originalFilename} />
      <AsyncImportStatus importId={importId} initialRecord={record} />
    </div>
  );
}
