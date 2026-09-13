import { Suspense } from "react";
import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { WelcomeGreeting } from "@/components/dashboard/welcome-greeting";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Dashboard — Polyglot",
};

/**
 * Spec 20 Account — Name: "do not leave the dashboard greeting on its
 * current independent Clerk-only path once the synchronized internal value
 * exists." Polyglot's `display_name` wins once it's been set (via
 * Settings); Clerk's own name is only a fallback for an account that has
 * never set one, so nobody's greeting regresses to "there" the moment this
 * ships. Skipped entirely for a sandbox persona, which has no Clerk session
 * of its own — `currentUser()` there would resolve to the *admin's* real
 * identity, not the persona being viewed.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  let name = user.displayName;
  if (!name && !user.isSandbox) {
    const clerkUser = await currentUser();
    name = clerkUser?.firstName ?? clerkUser?.username ?? null;
  }
  name ??= "there";

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex justify-start">
        <WelcomeGreeting name={name} />
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
