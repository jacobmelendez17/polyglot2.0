import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { CurriculumChoiceView } from "@/components/curriculum/curriculum-choice-view";
import { resolveOnboardingReturnTo } from "@/components/onboarding/onboarding-return-to";
import { canAccessAdminArea } from "@/domains/admin";
import { isOnboardingRequired } from "@/domains/users";
import { getLanguageSettings, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "How you learn — Polyglot",
};

type CurriculumPreferencePageProps = {
  searchParams: Promise<{ replay?: string; returnTo?: string }>;
};

/**
 * The curriculum preference screen (spec 16), shown immediately after the
 * onboarding slideshow's "Start Now!" and before the learner enters the app.
 *
 * It sits inside the `(onboarding)` route group deliberately: it is the
 * second half of the same first-run flow, wants the same full-screen shell
 * with no app navigation, and must not be gated by the `(app)`/`(focus)`
 * curriculum check it exists to satisfy.
 *
 * A learner who has already chosen is not sent back here — they change the
 * preference deliberately instead — but revisiting the URL shows their
 * current choice rather than an empty form, so a bookmarked or back-button
 * visit is never confusing.
 *
 * `?replay=1` is the Sandbox preview, mirroring `/onboarding?replay=1`
 * exactly: same production component, nothing persisted, and Admin access
 * re-checked here so the parameter is a request rather than a permission.
 * It is also the last screen of the one-giant-flow preview
 * (2026-09-26 decision) that starts at `/onboarding?replay=1` and chains
 * through `/onboarding/language?replay=1` — `returnTo` is threaded through
 * from there rather than hardcoded, so finishing here returns to wherever
 * the whole preview actually launched from.
 */
export default async function CurriculumPreferencePage({
  searchParams,
}: CurriculumPreferencePageProps) {
  const { replay, returnTo } = await searchParams;
  const user = await requireUser();

  if (replay === "1") {
    if (!canAccessAdminArea(user)) {
      forbidden();
    }
    return (
      <CurriculumChoiceView
        continueHref={resolveOnboardingReturnTo(returnTo)}
        isPreview
      />
    );
  }

  // The slideshow comes first: a learner who arrives here without finishing
  // it is sent back rather than shown the second screen of a flow they have
  // not started.
  if (isOnboardingRequired(user)) {
    redirect("/onboarding");
  }

  const settings = await getLanguageSettings(user.id, user.activeLanguageId);

  return (
    <CurriculumChoiceView
      initialMode={settings?.curriculumMode ?? null}
      continueHref="/dashboard"
    />
  );
}
