import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getLatestStreakAdjustment, insertStreakAdjustment } from "./streak-repository";

describe("streak-repository", () => {
  it("getLatestStreakAdjustment returns null when the learner has never set one", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      expect(await getLatestStreakAdjustment(tx, learnerId)).toBeNull();
    });
  });

  it("insertStreakAdjustment always creates a new row — never an upsert", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);

      const first = await insertStreakAdjustment(tx, { userId: learnerId, value: 20, now: new Date("2026-08-24T00:00:00Z") });
      const second = await insertStreakAdjustment(tx, { userId: learnerId, value: 25, now: new Date("2026-08-30T00:00:00Z") });

      expect(first.id).not.toBe(second.id);
      const latest = await getLatestStreakAdjustment(tx, learnerId);
      expect(latest?.id).toBe(second.id);
      expect(latest?.value).toBe(25);
      expect(latest?.createdAt).toEqual(new Date("2026-08-30T00:00:00Z"));
    });
  });
});
