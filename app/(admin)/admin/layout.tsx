import type { ReactNode } from "react";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminSidebarNav } from "@/components/admin/admin-sidebar-nav";
import { EnvironmentBadge } from "@/components/admin/environment-badge";
import { canAccessAdminArea, canManageCurriculum } from "@/domains/admin";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

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
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!canAccessAdminArea(user)) {
    forbidden();
  }
  const canManage = canManageCurriculum(user);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <AdminMobileNav canManageCurriculum={canManage} />
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
          <span className="hidden text-muted-foreground sm:inline">{user.displayName ?? "Admin"}</span>
          <Link href="/dashboard" className="font-medium text-foreground underline-offset-4 hover:underline">
            Exit
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border sm:block">
          <AdminSidebarNav canManageCurriculum={canManage} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
