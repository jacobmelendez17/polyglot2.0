import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { resolveOnboardingReturnTo } from "@/components/onboarding/onboarding-return-to";
import { canAccessAdminArea } from "@/domains/admin";
import { isOnboardingRequired } from "@/domains/users";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Welcome — Polyglot",
};

type OnboardingPageProps = {
  searchParams: Promise<{ replay?: string; returnTo?: string }>;
};

/**
 * The onboarding slideshow route (spec 15).
 *
 * Whether onboarding is *required* is decided here, on the server, from the
 * user record — never from localStorage, a cookie, or a client-side redirect.
 * A learner who has already finished is sent straight into the app rather
 * than being shown the tour again.
 *
 * `?replay=1` runs the same production components, always from slide 1, as
 * many times as wanted, and is the one way to reach this route after
 * completing. Originally the Sandbox's "Replay Onboarding" (spec 15,
 * admin-only); spec 20's Settings "Onboarding Tour" opens this to every
 * authenticated learner replaying their own introduction — nothing here
 * persists regardless of caller (`OnboardingFlow`'s `isReplay`, and the
 * completion Server Action itself refuses to write in this mode), so
 * widening *who* may request a preview widens no authoritative behavior.
 *
 * `returnTo` is a closed set (`"settings"` or the Sandbox default), never an
 * arbitrary client-supplied path — accepting one would be an open-redirect
 * hazard for zero benefit, since every real caller is one of these two.
 *
 * An Admin's preview is one giant flow (2026-09-26 decision): finishing the
 * slides chains straight into the language-choice and curriculum-choice
 * screens' own previews instead of ending here, so Sandbox's "Replay
 * Onboarding" shows the whole first-run experience in one continuous pass
 * rather than needing a separate "replay choice screen" entry point. A
 * plain learner's Settings replay is unaffected — it still ends after the
 * slideshow, matching today's authorization boundary (the choice screens'
 * own previews stay Admin-only).
 */
export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const { replay, returnTo } = await searchParams;
  const isReplayRequested = replay === "1";

  // proxy.ts protects /onboarding, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request never
  // reaches this far in practice.
  const user = await requireUser();

  if (isReplayRequested) {
    const canChainFurther = canAccessAdminArea(user);
    return (
      <OnboardingFlow
        isReplay
        returnTo={resolveOnboardingReturnTo(returnTo)}
        continueHref={
          canChainFurther
            ? `/onboarding/language?replay=1${returnTo ? `&returnTo=${returnTo}` : ""}`
            : undefined
        }
      />
    );
  }

  if (!isOnboardingRequired(user)) {
    redirect("/dashboard");
  }

  return <OnboardingFlow isReplay={false} />;
}
