import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { CurriculumChoiceView } from "@/components/curriculum/curriculum-choice-view";
import { canAccessAdminArea } from "@/domains/admin";
import { listAvailableThemes } from "@/domains/lessons/server";
import { isOnboardingRequired } from "@/domains/users";
import { getLanguageSettings, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "How you learn — Polyglot",
};

type CurriculumPreferencePageProps = {
  searchParams: Promise<{ replay?: string }>;
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
 */
export default async function CurriculumPreferencePage({ searchParams }: CurriculumPreferencePageProps) {
  const { replay } = await searchParams;
  const user = await requireUser();

  if (replay === "1") {
    if (!canAccessAdminArea(user)) {
      forbidden();
    }
    const themes = await listAvailableThemes({ userId: user.id, languageId: user.activeLanguageId });
    return <CurriculumChoiceView themes={themes} continueHref="/admin/sandbox" isPreview />;
  }

  // The slideshow comes first: a learner who arrives here without finishing
  // it is sent back rather than shown the second screen of a flow they have
  // not started.
  if (isOnboardingRequired(user)) {
    redirect("/onboarding");
  }

  const [themes, settings] = await Promise.all([
    listAvailableThemes({ userId: user.id, languageId: user.activeLanguageId }),
    getLanguageSettings(user.id, user.activeLanguageId),
  ]);

  return (
    <CurriculumChoiceView
      themes={themes}
      initialMode={settings?.curriculumMode ?? null}
      initialThemeId={settings?.selectedVocabularyGroupId ?? null}
      continueHref="/dashboard"
    />
  );
}
