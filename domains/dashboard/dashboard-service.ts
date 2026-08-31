import { createPopulatedDashboardFixture } from "./dashboard-fixtures";
import type { DashboardData } from "./dashboard-types";

/**
 * Returns the current user's dashboard read model.
 *
 * Temporary implementation: always resolves a fixture, ignoring `userId`.
 * The real implementation will aggregate read models from the `srs`,
 * `lessons`, and `progress` domains (per architecture.md's `dashboard`
 * boundary) once the Neon-backed user/progress plumbing referenced in
 * progress-tracker.md's "Next Up" list exists — including detecting a
 * genuinely new user and returning `createNewUserDashboardFixture`'s shape
 * instead. The `Promise` return type is kept now so callers already await
 * this like the eventual database-backed call.
 */
export async function getDashboardData(userId: string): Promise<DashboardData> {
  void userId;
  return createPopulatedDashboardFixture(new Date());
}
