import type { ReactNode } from "react";

import { SettingsMobileNav } from "@/components/settings/settings-mobile-nav";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { requireUser } from "@/domains/users/server";

/**
 * Settings shell (spec 20 "Layout"). Lives inside the existing `(app)`
 * route group rather than a standalone auth boundary, so it inherits
 * `AppHeader`, `AppNavMobile`, and the onboarding/curriculum-choice gates
 * from `app/(app)/layout.tsx` for free — spec 20 is explicit that Settings
 * must not create a separate authentication boundary.
 *
 * `requireUser()` re-resolves the authenticated user here the same way
 * `AdminLayout` does for `/admin`: the outer layout already guarantees a
 * signed-in, onboarded user reaches this far, but every route re-checking
 * its own requirement (here, just "is there a user at all") is the
 * established pattern rather than relying solely on an ancestor layout.
 */
export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3">
        <SettingsMobileNav />
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Settings
        </h1>
      </div>

      <div className="flex flex-1 flex-col gap-6 sm:flex-row sm:gap-8">
        <aside className="hidden w-56 shrink-0 sm:block">
          <SettingsSidebarNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
