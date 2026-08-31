import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData } from "@/domains/dashboard";

export async function DashboardContent() {
  const { userId } = await auth();
  if (!userId) {
    // proxy.ts protects /dashboard, so this is unreachable in practice.
    redirect("/sign-in");
  }

  const data = await getDashboardData(userId);

  return <DashboardView data={data} />;
}
