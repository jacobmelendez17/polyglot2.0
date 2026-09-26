import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { LanguageChoiceView } from "@/components/onboarding/language-choice-view";
import { canAccessAdminArea } from "@/domains/admin";
import { getLanguages } from "@/domains/curriculum/server";
import { isOnboardingRequired } from "@/domains/users";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "What are you learning? — Polyglot",
};

type LanguageChoicePageProps = {
  searchParams: Promise<{ replay?: string; returnTo?: string }>;
};

/**
 * The language-choice screen (2026-09-26), shown immediately after the
 * onboarding slideshow and before the curriculum choice — "Add language
 * option before curriculum option."
 *
 * Sits inside the `(onboarding)` route group for the same reasons
 * `onboarding/curriculum/page.tsx` does: same full-screen shell, no app
 * navigation, must not be gated by the `(app)`/`(focus)` curriculum check
 * it precedes.
 *
 * `?replay=1` is the Admin preview, continuing the same one-giant-flow
 * `/onboarding?replay=1` started (2026-09-26 decision) — reached by
 * finishing the slides' own preview, not a separate entry point, and
 * re-checking Admin access itself the same way `onboarding/curriculum/
 * page.tsx` already does, so the URL is never a bare permission.
 */
export default async function LanguageChoicePage({
  searchParams,
}: LanguageChoicePageProps) {
  const { replay, returnTo } = await searchParams;
  const user = await requireUser();
  const languages = await getLanguages();

  if (replay === "1") {
    if (!canAccessAdminArea(user)) {
      forbidden();
    }
    return (
      <LanguageChoiceView
        languages={languages}
        initialLanguageId={user.activeLanguageId}
        continueHref={`/onboarding/curriculum?replay=1${returnTo ? `&returnTo=${returnTo}` : ""}`}
        isPreview
      />
    );
  }

  // The slideshow comes first: a learner who arrives here without finishing
  // it is sent back rather than shown a later step of a flow they have not
  // started, matching `onboarding/curriculum/page.tsx`'s own guard.
  if (isOnboardingRequired(user)) {
    redirect("/onboarding");
  }

  return (
    <LanguageChoiceView
      languages={languages}
      initialLanguageId={user.activeLanguageId}
      continueHref="/onboarding/curriculum"
    />
  );
}
