import { eq, sql } from "drizzle-orm";

import { learningItems, users } from "@/db/schema";
import type { UserRole } from "@/domains/users";

import { withE2EDb } from "./e2e-db";

/**
 * Spec 26 — direct-DB helpers for the Admin console's role-matrix E2E specs.
 *
 * There is exactly one permanent, non-production Clerk identity with Admin
 * access (`Polyglot E2E Admin`, spec 22), and no committed writer or
 * developer identity. Rather than mint more real Clerk accounts, a spec flips
 * that identity's *database* role on the isolated E2E branch — which is the
 * authoritative source for every server-side check anyway (architecture.md
 * "Roles") — and always restores it. `withE2EDb` refuses to run against
 * anything but the guarded `E2E_DATABASE_URL`.
 */

function adminClerkUserId(): string {
  const value = process.env.E2E_ADMIN_CLERK_USER_ID;
  if (!value)
    throw new Error(
      "E2E_ADMIN_CLERK_USER_ID is required. Set it in .env.local — see .env.example.",
    );
  return value;
}

/** Sets the E2E admin identity's database role. Takes effect on its very next server request. */
export async function setE2EAdminRole(role: UserRole): Promise<void> {
  await withE2EDb(async (db) => {
    const updated = await db
      .update(users)
      .set({ role })
      .where(eq(users.clerkUserId, adminClerkUserId()))
      .returning({ id: users.id });
    if (updated.length !== 1)
      throw new Error(
        "No E2E admin row found — run `npm run e2e:setup` first.",
      );
  });
}

export type StatusCounts = {
  published: number;
  pending: number;
  draft: number;
  archived: number;
};

/**
 * Per-status learning-item counts for the E2E admin's own active language,
 * computed with an independent query — so a spec can compare what the UI
 * shows against the database rather than against the code under test.
 */
export async function getE2EAdminStatusCounts(): Promise<StatusCounts> {
  return withE2EDb(async (db) => {
    const [admin] = await db
      .select({ activeLanguageId: users.activeLanguageId })
      .from(users)
      .where(eq(users.clerkUserId, adminClerkUserId()))
      .limit(1);
    if (!admin)
      throw new Error(
        "No E2E admin row found — run `npm run e2e:setup` first.",
      );

    const rows = await db
      .select({
        status: learningItems.status,
        count: sql<number>`count(*)::int`,
      })
      .from(learningItems)
      .where(eq(learningItems.languageId, admin.activeLanguageId))
      .groupBy(learningItems.status);

    const counts: StatusCounts = {
      published: 0,
      pending: 0,
      draft: 0,
      archived: 0,
    };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  });
}
