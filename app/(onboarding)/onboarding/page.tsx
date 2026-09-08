import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { canAccessAdminArea } from "@/domains/admin";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { isOnboardingRequired } from "@/domains/users";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Welcome — Polyglot",
};

type OnboardingPageProps = {
  searchParams: Promise<{ replay?: string }>;
};

/**
 * The onboarding slideshow route (spec 15).
 *
 * Whether onboarding is *required* is decided here, on the server, from the
 * user record — never from localStorage, a cookie, or a client-side redirect.
 * A learner who has already finished is sent straight into the app rather
 * than being shown the tour again.
 *
 * `?replay=1` is the Sandbox's "Replay Onboarding" (spec 15). It runs the
 * same production components, always from slide 1, as many times as wanted —
 * and it is the one way to reach this route after completing. Access is
 * re-checked here against `canAccessAdminArea`, so the parameter is a
 * request, not a permission: a normal learner appending it gets `forbidden()`,
 * not a replay.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { replay } = await searchParams;
  const isReplayRequested = replay === "1";

  // proxy.ts protects /onboarding, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request never
  // reaches this far in practice.
  const user = await requireUser();

  if (isReplayRequested) {
    if (!canAccessAdminArea(user)) {
      forbidden();
    }
    return <OnboardingFlow isReplay />;
  }

  if (!isOnboardingRequired(user)) {
    redirect("/dashboard");
  }

  return <OnboardingFlow isReplay={false} />;
}
