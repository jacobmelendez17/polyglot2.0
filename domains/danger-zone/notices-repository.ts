import { count, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userDismissedNotices } from "@/db/schema";

/**
 * Spec 20 Danger Zone — Reset Dismissable Warnings. "Reset removes the
 * authenticated user's dismissal records" — every row for this user,
 * regardless of `notice_key`; there is no partial/per-warning reset in the
 * spec's mockup. Storage only: nothing in this codebase writes a
 * dismissal yet (no "Don't show this message again" warning exists), so
 * this delete is currently a correct no-op for every real account — see
 * `db/schema/user-settings.ts`'s `userDismissedNotices` docstring.
 */
export async function deleteDismissedNotices(
  db: DbClient,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userDismissedNotices)
    .where(eq(userDismissedNotices.userId, userId));
  await db
    .delete(userDismissedNotices)
    .where(eq(userDismissedNotices.userId, userId));
  return row?.value ?? 0;
}
