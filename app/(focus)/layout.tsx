import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

import { SandboxViewBanner } from "@/components/shared/sandbox-view-banner";
import { resolveCurrentUser } from "@/domains/users/server";

/**
 * Minimal shell for full-focus learning experiences (spec 07 §1). No
 * `AppHeader`/`AppNavMobile` — lessons (and later, reviews and practice)
 * provide their own exit control, context, and progress navigation.
 *
 * The sandbox banner is the one exception to "minimal", and deliberately so:
 * these are exactly the pages that *write* progress, so an admin who has
 * forgotten they are viewing as their sandbox persona would otherwise
 * complete lessons and answer reviews against the wrong account with nothing
 * on screen to say so.
 */
export default async function FocusLayout({ children }: { children: ReactNode }) {
  const user = await resolveCurrentUser();

  return (
    <MotionConfig reducedMotion="user">
      {user?.isSandbox ? <SandboxViewBanner /> : null}
      <main id="main" className="min-h-svh bg-background">
        {children}
      </main>
    </MotionConfig>
  );
}
