import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MotionConfig } from "motion/react";

import { SandboxViewBanner } from "@/components/shared/sandbox-view-banner";
import {
  isCurriculumChoiceRequired,
  isOnboardingRequired,
} from "@/domains/users";
import {
  getLanguageSettings,
  resolveCurrentUser,
} from "@/domains/users/server";

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
 *
 * The onboarding gate (spec 15) is applied here as well as in `(app)`: these
 * routes are reachable by direct URL, and a learner who has not finished
 * onboarding should not be able to start a lesson or a review by typing one.
 */
export default async function FocusLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await resolveCurrentUser();

  if (user && isOnboardingRequired(user)) {
    redirect("/onboarding");
  }

  // Spec 16 — the curriculum choice is the second half of the first-run
  // flow, gated server-side for the same reason onboarding is: it decides
  // how lessons are built, so it must not be skippable by typing a URL.
  // Sandbox personas are exempt inside `isCurriculumChoiceRequired` itself.
  if (
    user &&
    isCurriculumChoiceRequired(
      user,
      await getLanguageSettings(user.id, user.activeLanguageId),
    )
  ) {
    redirect("/onboarding/curriculum");
  }

  return (
    <MotionConfig reducedMotion="user">
      {user?.isSandbox ? <SandboxViewBanner /> : null}
      <main id="main" className="min-h-svh bg-background">
        {children}
      </main>
    </MotionConfig>
  );
}
