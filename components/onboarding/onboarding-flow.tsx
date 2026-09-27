"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { completeOnboardingAction } from "@/app/(onboarding)/onboarding/actions";
import { OnboardingSlides } from "@/components/onboarding/onboarding-slides";

type OnboardingFlowProps = {
  /**
   * Replay mode (spec 15, extended by spec 20's Settings "Onboarding
   * Tour"). Completion is previewed in full but never written, and
   * finishing returns to `returnTo` instead of the app. The server action
   * refuses to write in this mode too — this flag decides presentation, not
   * authorization.
   */
  isReplay: boolean;
  /**
   * Where a replay preview returns to when finished. Only meaningful when
   * `isReplay` is true. Defaults to the Sandbox's own launch point so the
   * original spec 15 caller (`sandbox-controls.tsx`) needs no change; spec
   * 20's Settings "Replay" passes `/settings/account` instead.
   */
  returnTo?: string;
  /**
   * Replay only: where "Start learning" navigates instead of straight to
   * `returnTo` — the one giant preview (2026-09-26 decision) continues into
   * the language-choice and curriculum-choice screens' own previews rather
   * than ending after the slides. Omit to end here, exactly like before
   * (`onboarding/page.tsx` only supplies this for an Admin preview — a
   * plain learner's Settings replay still ends after the slideshow).
   */
  continueHref?: string;
};

/**
 * The onboarding route's client boundary (spec 15). The slideshow itself —
 * slides, transitions, controls — is `OnboardingSlides` (v2, 2026-09-27);
 * this owns only what happens when it finishes: writing completion (or, for
 * a replay, writing nothing), and where the learner goes next.
 */
export function OnboardingFlow({
  isReplay,
  returnTo = "/admin/sandbox",
  continueHref,
}: OnboardingFlowProps) {
  const router = useRouter();
  const [isCompleting, startCompleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(() => {
    setError(null);

    if (isReplay) {
      // Nothing is persisted for a replay. `continueHref`, when given,
      // chains straight into the next screen's own preview instead of
      // ending here (the one-giant-flow decision, 2026-09-26); otherwise
      // the preview ends by returning to where it was launched from.
      router.replace(continueHref ?? returnTo);
      return;
    }

    startCompleting(async () => {
      const result = await completeOnboardingAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Onboarding's next step is choosing a language, then the curriculum
      // choice (spec 16) — both before the app itself, since a lesson can't
      // be built until the learner has answered both.
      router.replace("/onboarding/language");
    });
  }, [isReplay, returnTo, continueHref, router]);

  return (
    <>
      {isReplay ? (
        <p className="pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground/85 px-4 py-1.5 text-center text-xs font-medium whitespace-nowrap text-background">
          Preview — finishing here will not change your onboarding status.
        </p>
      ) : null}
      <OnboardingSlides
        onFinish={finish}
        isFinishing={isCompleting}
        error={error}
      />
    </>
  );
}
