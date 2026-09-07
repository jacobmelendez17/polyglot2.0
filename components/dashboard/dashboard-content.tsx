import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData } from "@/domains/dashboard/server";
import { requireUser } from "@/domains/users/server";

/**
 * `requireUser()`, not raw Clerk `auth()` — every real `domains/progress`/
 * `domains/srs` query keys on the internal Polyglot UUID
 * (`user_item_progress.user_id`'s FK target), not Clerk's raw id. The
 * original fixture-backed version read `auth().userId` directly, which
 * would have silently queried against a value no real row can ever match —
 * the exact trap already flagged for spec 07 unit 6 in progress-tracker.md,
 * caught here before it shipped rather than after.
 */
export async function DashboardContent() {
  const user = await requireUser();
  const data = await getDashboardData({ userId: user.id, languageId: user.activeLanguageId });

  return <DashboardView data={data} />;
}
