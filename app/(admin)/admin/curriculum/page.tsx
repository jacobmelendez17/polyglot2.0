import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { canManageCurriculum } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Curriculum — Polyglot Admin",
};

/**
 * Curriculum-management route (spec 11 §8-§35). Admin only — re-checked
 * here independently of the layout's broader `canAccessAdminArea` check,
 * since a developer without the admin role is admitted to `/admin` but not
 * to this route (spec 11 §4).
 */
export default async function AdminCurriculumPage() {
  const user = await requireUser();
  if (!canManageCurriculum(user)) {
    forbidden();
  }

  return (
    <div>
      <AdminPageHeader
        title="Curriculum"
        description="Search, filter, create, edit, and publish official curriculum."
      />
      <p className="text-sm text-muted-foreground">
        The curriculum table, editors, and publication workflow will be available here.
      </p>
    </div>
  );
}
