import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, levels, userVacationPeriods, users } from "@/db/schema";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction, type TestTx } from "@/db/test/with-test-transaction";

import { getDefaultLanguageCode } from "./provisioning-config";
import { provisionUser } from "./user-repository";
import { endVacationPeriod, findActiveVacationPeriod, startVacationPeriod } from "./vacation-repository";

/** Same minimal §38 prerequisite as `user-repository.integration.test.ts` — see that file for the full reasoning. */
async function seedDefaultLanguageAndLevel1(tx: TestTx) {
  const languageCode = getDefaultLanguageCode();
  const [insertedLanguage] = await tx
    .insert(languages)
    .values({ code: languageCode, slug: `spanish-${randomUUID()}`, name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning();
  const language =
    insertedLanguage ?? (await tx.select().from(languages).where(eq(languages.code, languageCode)).limit(1))[0];

  const [insertedLevel1] = await tx
    .insert(levels)
    .values({ languageId: language.id, levelNumber: 1 })
    .onConflictDoNothing({ target: [levels.languageId, levels.levelNumber] })
    .returning();
  const level1 =
    insertedLevel1 ??
    (await tx.select().from(levels).where(and(eq(levels.languageId, language.id), eq(levels.levelNumber, 1))).limit(1))[0];

  return { language, level1 };
}

describe("vacation-repository", () => {
  it("findActiveVacationPeriod returns null when the learner has never taken one", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      const user = await provisionUser(tx, "clerk-vacation-none");

      expect(await findActiveVacationPeriod(tx, user.id)).toBeNull();
    });
  });

  it("startVacationPeriod creates an active period, and is idempotent on a repeat call", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      const user = await provisionUser(tx, "clerk-vacation-start");
      const startedAt = new Date("2026-02-01T00:00:00Z");

      const first = await startVacationPeriod(tx, user.id, startedAt);
      expect(first.endedAt).toBeNull();
      expect(first.startedAt).toEqual(startedAt);

      // Spec 20 Vacation Concurrency: enabling twice must not create a second active period.
      const second = await startVacationPeriod(tx, user.id, new Date("2026-02-05T00:00:00Z"));
      expect(second.id).toBe(first.id);
      expect(second.startedAt).toEqual(startedAt);
    });
  });

  it("endVacationPeriod closes the active period and is idempotent on a repeat call", async () => {
    await withTestTransaction(async (tx) => {
      await seedDefaultLanguageAndLevel1(tx);
      const user = await provisionUser(tx, "clerk-vacation-end");
      const startedAt = new Date("2026-02-01T00:00:00Z");
      const endedAt = new Date("2026-02-10T00:00:00Z");

      await startVacationPeriod(tx, user.id, startedAt);
      const closed = await endVacationPeriod(tx, user.id, endedAt);
      expect(closed?.endedAt).toEqual(endedAt);
      expect(await findActiveVacationPeriod(tx, user.id)).toBeNull();

      // Spec 20 Vacation Concurrency: disabling twice must not shift dates twice — signaled by returning null.
      const secondClose = await endVacationPeriod(tx, user.id, new Date("2026-02-11T00:00:00Z"));
      expect(secondClose).toBeNull();
    });
  });

  it(
    "a real concurrent enable only creates one active period — the database decides, not a check-then-insert race",
    async () => {
      const clerkUserId = `clerk-vacation-race-${randomUUID()}`;
      let userId: string | undefined;
      try {
        const user = await provisionUser(testDb, clerkUserId);
        userId = user.id;

        await Promise.allSettled([
          startVacationPeriod(testDb, user.id, new Date("2026-02-01T00:00:00Z")),
          startVacationPeriod(testDb, user.id, new Date("2026-02-01T00:00:01Z")),
        ]);

        const activePeriods = await testDb
          .select()
          .from(userVacationPeriods)
          .where(and(eq(userVacationPeriods.userId, user.id)));
        expect(activePeriods.filter((row) => row.endedAt === null)).toHaveLength(1);
      } finally {
        if (userId) await testDb.delete(userVacationPeriods).where(eq(userVacationPeriods.userId, userId));
        await testDb.delete(users).where(eq(users.clerkUserId, clerkUserId));
      }
    },
    15_000,
  );
});
