import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminReviewListApp } from "@/components/admin/react-admin/review/review-list-app";
import { canManageCurriculum } from "@/domains/admin";
import { getLanguages } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Review — Polyglot Admin",
};

/**
 * Everything waiting for Admin verification (spec 17), as a React Admin list
 * (spec 26 Unit 3).
 *
 * A writer can author freely, and none of it reaches a learner on its own —
 * new items stay `pending` and edits to published items stay in a draft.
 * Without this page, "Admin verifies everything" would mean "Admin remembers
 * to go looking", so this is the one place both kinds appear together.
 *
 * Visible to anyone who can author, so a writer can see their own work
 * queued; publishing from here requires `canPublishCurriculum`, which the
 * publish endpoint re-checks from the database role on every call and which
 * the screen never infers from what rendered.
 *
 * This page keeps only the server-side guard and the languages. The queue
 * itself is fetched by the React Admin screen from `/api/v1/admin/review`,
 * which reads `?language=` and `?cursor=` from the real URL.
 */
export default async function CurriculumReviewPage() {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const languages = await getLanguages();
  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader
          title="Review"
          description="Everything waiting to be verified."
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
        title="Review"
        description="New items and edits to published items, waiting for an Admin to publish them."
      />
      <AdminReviewListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        languages={languages.map((language) => ({
          id: language.id,
          name: language.name,
        }))}
      />
    </div>
  );
}
