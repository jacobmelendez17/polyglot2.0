import type { DbClient } from "@/db/client";
import { withIdempotency } from "@/domains/idempotency";

import { deleteDismissedNotices } from "./notices-repository";

export type ResetDismissedWarningsInput = {
  userId: string;
  idempotencyKey: string;
};

/** Spec 20 Danger Zone — Reset Dismissable Warnings. */
export async function resetDismissedWarnings(
  db: DbClient,
  input: ResetDismissedWarningsInput,
): Promise<{ affectedItemCount: number }> {
  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "danger-zone.reset-dismissed-warnings",
      key: input.idempotencyKey,
      payload: {},
    },
    async (tx) => {
      const affectedItemCount = await deleteDismissedNotices(tx, input.userId);
      return { affectedItemCount };
    },
  );
}
