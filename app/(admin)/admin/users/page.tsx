import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminUsersListApp } from "@/components/admin/react-admin/users/users-list-app";
import { canManageUsers } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Users — Polyglot Admin",
};

/**
 * Spec 26 Unit 6 — the Users & Roles console: find an account, and change its
 * single role. New functionality, not a migration: there was no such screen.
 *
 * **Admin only** (`canManageUsers`), re-checked here from the database role
 * independently of the layout's broader `canAccessAdminArea` — a writer or
 * developer is admitted to `/admin` but not to this route, and gets a 403, not
 * an empty list. The accounts themselves are fetched by the screen from
 * `GET /api/v1/admin/users`, which is guarded the same way on every request.
 *
 * The page hands the screen only the signed-in Admin's own account id, so their
 * own row offers no role change (the endpoint refuses one regardless).
 */
export default async function AdminUsersPage() {
  const user = await requireUser();
  if (!canManageUsers(user)) forbidden();

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description="Find an account and change its role."
      />
      <AdminUsersListApp
        signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
        currentUserId={user.id}
      />
    </div>
  );
}
