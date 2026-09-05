import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { canAccessAdminArea } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Logs — Polyglot Admin",
};

/**
 * Audit/System logs route (spec 11 §46-§52). Available to both admin and
 * developer (spec 11 §4's "selected system logs where appropriate") — the
 * Audit-vs-System tab split and any developer-specific content
 * restriction is built in Unit 11.
 */
export default async function AdminLogsPage() {
  const user = await requireUser();
  if (!canAccessAdminArea(user)) {
    forbidden();
  }

  return (
    <div>
      <AdminPageHeader title="Logs" description="Administrative audit history and selected system diagnostics." />
      <p className="text-sm text-muted-foreground">The Audit and System log tabs will be available here.</p>
    </div>
  );
}
