import { Suspense } from "react";
import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";

import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { WelcomeGreeting } from "@/components/dashboard/welcome-greeting";

export const metadata: Metadata = {
  title: "Dashboard — Polyglot",
};

export default async function DashboardPage() {
  const user = await currentUser();
  const name = user?.firstName ?? user?.username ?? "there";

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
