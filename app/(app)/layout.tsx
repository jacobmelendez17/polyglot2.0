import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MotionConfig } from "motion/react";

import { AppHeader } from "@/components/shared/app-header";
import { AppNavMobile } from "@/components/shared/app-nav-mobile";
import { SandboxViewBanner } from "@/components/shared/sandbox-view-banner";
import { isCurriculumChoiceRequired, isOnboardingRequired } from "@/domains/users";
import { getLanguageSettings, resolveCurrentUser } from "@/domains/users/server";

/**
 * The banner renders from the *resolved* user, not from the cookie: if
 * `resolveCurrentUser` refused the grant for any reason, the app is not in a
 * sandbox session and no banner appears. The two can never disagree, because
 * they read the same answer.
 *
 * The onboarding gate (spec 15) lives here rather than in each page, so every
 * route in this group is covered by one rule, and so the decision comes from
 * the user record rather than anything the browser could set. `/admin` is
 * deliberately *not* gated — an admin must always be able to reach the
 * Sandbox, including to replay onboarding — and sandbox personas are exempt
 * inside `isOnboardingRequired` itself.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await resolveCurrentUser();

  if (user && isOnboardingRequired(user)) {
    redirect("/onboarding");
  }

  // Spec 16 — the curriculum choice is the second half of the first-run
  // flow, gated server-side for the same reason onboarding is: it decides
  // how lessons are built, so it must not be skippable by typing a URL.
  // Sandbox personas are exempt inside `isCurriculumChoiceRequired` itself.
  if (user && isCurriculumChoiceRequired(user, await getLanguageSettings(user.id, user.activeLanguageId))) {
    redirect("/onboarding/curriculum");
  }

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
