import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { canAccessAdminArea } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Sandbox — Polyglot Admin",
};

/**
 * Developer sandbox route (spec 11 §53-§59). Available to both admin and
 * developer (spec 11 §53). Sandbox controls, isolated from real learner
 * state via the existing `users.is_sandbox` model (ADR-020), are built in
 * Unit 12.
 */
export default async function AdminSandboxPage() {
  const user = await requireUser();
  if (!canAccessAdminArea(user)) {
    forbidden();
  }

  return (
    <div>
      <AdminPageHeader
        title="Sandbox"
        description="Test any curriculum level, SRS state, or unlock behavior in an environment fully isolated from real learner progress."
      />
      <p className="text-sm text-muted-foreground">Sandbox controls will be available here.</p>
    </div>
  );
}
