import type { ReactNode } from "react";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { getAdminExternalLinks } from "@/components/admin/admin-external-links";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminSidebarNav } from "@/components/admin/admin-sidebar-nav";
import { EnvironmentBadge } from "@/components/admin/environment-badge";
import { buildAdminPermissions, canAccessAdminArea } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";
import { env, operationalLinks } from "@/lib/env";

/**
 * Admin shell (spec 11 §5/§6). `proxy.ts` already guarantees an
 * authenticated Clerk session for every `/admin(.*)` request, but that only
 * proves *who* the visitor is — the database role is what's authoritative
 * (architecture.md's "hidden navigation is never authorization"), so this
 * layout independently resolves the internal user and re-checks the role
 * here, on every request, not just once at sign-in.
 *
 * Each page under this layout re-checks its own, more specific requirement
 * (e.g. `canManageCurriculum` for `/admin/curriculum`) rather than trusting
 * that reaching this layout is sufficient — spec 11 §5's "every
 * administrative mutation must independently verify authorization" is
 * intentionally read broadly here, as every route, not just mutations.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  if (!canAccessAdminArea(user)) {
    forbidden();
  }
  // The same effective permissions `GET /api/v1/admin/me` serves to the React
  // Admin screens (spec 26 Unit 11): the navigation offers exactly what they
  // would let the person open, and nothing is decided twice.
  const permissions = buildAdminPermissions(user);
  // Spec 27 Unit 27.10: the links out of Polyglot (today, Analytics) — kept apart
  // from the page links (`getAdminNavItems`) because they depend on a deployment
  // setting, leave the application, and are offered only to those who may use
  // developer tools.
  const externalLinks = getAdminExternalLinks(permissions, operationalLinks);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <AdminMobileNav
            permissions={permissions}
            externalLinks={externalLinks}
          />
          {/* "Polyglot" is dropped below `sm:` — at mobile widths the full
              wordmark plus the environment badge and Exit link don't fit
              without wrapping/overlapping (found via real-browser check at
              390px). */}
          <span className="font-heading text-base font-semibold whitespace-nowrap text-foreground">
            <span className="hidden sm:inline">Polyglot </span>Admin
          </span>
          <EnvironmentBadge appEnv={env.APP_ENV} />
        </div>
        <div className="flex shrink-0 items-center gap-4 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {user.displayName ?? "Admin"}
          </span>
          <Link
            href="/dashboard"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Exit
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border sm:block">
          <AdminSidebarNav
            permissions={permissions}
            externalLinks={externalLinks}
          />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
