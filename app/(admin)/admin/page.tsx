import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminOverviewApp } from "@/components/admin/react-admin/overview/overview-app";
import { canManageCurriculum, canUseDeveloperTools } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Admin Overview — Polyglot",
};

function describeOverview(user: Parameters<typeof canManageCurriculum>[0]) {
  const manages = canManageCurriculum(user);
  const usesTools = canUseDeveloperTools(user);
  if (manages && usesTools) {
    return "Manage official curriculum, logs, and the developer sandbox.";
  }
  if (manages) return "Author and review official curriculum.";
  return "You have developer access to the sandbox and logs. Curriculum management requires an admin role.";
}

/**
 * Admin Overview (spec 11 §7, migrated by spec 26 Unit 1). The heading and
 * the role guard stay server-side; everything below the heading — the
 * curriculum counts and the shortcuts — is rendered by the React Admin
 * client boundary from `/api/v1/admin/*`, which re-authenticates and
 * re-checks the database role on its own. This page's `requireUser()` call
 * only decides the heading's wording; it is not what protects the data.
 */
export default async function AdminOverviewPage() {
  const user = await requireUser();

  return (
    <div>
      <AdminPageHeader title="Overview" description={describeOverview(user)} />
      <AdminOverviewApp signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL} />
    </div>
  );
}
