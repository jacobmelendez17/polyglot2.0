import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

import { AppHeader } from "@/components/shared/app-header";
import { AppNavMobile } from "@/components/shared/app-nav-mobile";
import { SandboxViewBanner } from "@/components/shared/sandbox-view-banner";
import { resolveCurrentUser } from "@/domains/users/server";

/**
 * The banner renders from the *resolved* user, not from the cookie: if
 * `resolveCurrentUser` refused the grant for any reason, the app is not in a
 * sandbox session and no banner appears. The two can never disagree, because
 * they read the same answer.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await resolveCurrentUser();

  return (
    <MotionConfig reducedMotion="user">
      {user?.isSandbox ? <SandboxViewBanner /> : null}
      <AppHeader />
      <main id="main" className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
      <AppNavMobile />
    </MotionConfig>
  );
}
