import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { userDismissedNotices } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { deleteDismissedNotices } from "./notices-repository";

describe("notices-repository", () => {
  it("deleteDismissedNotices removes every row for the user and returns how many were removed", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await tx.insert(userDismissedNotices).values([
        { userId: learnerId, noticeKey: "VACATION_LESSON_WARNING" },
        { userId: learnerId, noticeKey: "SOME_OTHER_WARNING" },
      ]);

      const removedCount = await deleteDismissedNotices(tx, learnerId);

      expect(removedCount).toBe(2);
      const remaining = await tx
        .select()
        .from(userDismissedNotices)
        .where(eq(userDismissedNotices.userId, learnerId));
      expect(remaining).toHaveLength(0);
    });
  });

  it("never touches another learner's dismissed notices", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId } = await seedTestFixtures(tx);
      await tx.insert(userDismissedNotices).values([
        { userId: learnerId, noticeKey: "VACATION_LESSON_WARNING" },
        { userId: developerId, noticeKey: "VACATION_LESSON_WARNING" },
      ]);

      await deleteDismissedNotices(tx, learnerId);

      const developerRows = await tx
        .select()
        .from(userDismissedNotices)
        .where(eq(userDismissedNotices.userId, developerId));
      expect(developerRows).toHaveLength(1);
    });
  });

  it("returns 0 when there is nothing to reset", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      expect(await deleteDismissedNotices(tx, learnerId)).toBe(0);
    });
  });
});
