import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { userDismissedNotices } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { resetDismissedWarnings } from "./notices-service";

describe("resetDismissedWarnings (spec 20 Danger Zone)", () => {
  it("removes every dismissed-notice row for the learner", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await tx.insert(userDismissedNotices).values({ userId: learnerId, noticeKey: "VACATION_LESSON_WARNING" });

      const result = await resetDismissedWarnings(tx, { userId: learnerId, idempotencyKey: crypto.randomUUID() });

      expect(result.affectedItemCount).toBe(1);
      const remaining = await tx.select().from(userDismissedNotices).where(eq(userDismissedNotices.userId, learnerId));
      expect(remaining).toHaveLength(0);
    });
  });

  it("is idempotent — retrying with the same key returns the original result", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await tx.insert(userDismissedNotices).values({ userId: learnerId, noticeKey: "VACATION_LESSON_WARNING" });
      const idempotencyKey = crypto.randomUUID();

      const first = await resetDismissedWarnings(tx, { userId: learnerId, idempotencyKey });
      const second = await resetDismissedWarnings(tx, { userId: learnerId, idempotencyKey });

      expect(second).toEqual(first);
    });
  });
});
